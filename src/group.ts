// Handles all Group functionality, including updating logs and log operations
import { Event, EventType, Member, SourceType, QuestionData, QuestionPropertyMatch, GroupSettings, GenericMap, MemberProperty } from "./group-interfaces.js";
import { OperationBuilder, Operations } from "./group-operations.js";
import { google } from "googleapis";
import { getSheets, getForms } from "./google-client.js";
import { GaxiosResponse } from "gaxios";
import crypto from "crypto";
import { RANGE_EVENTS, RANGE_EVENT_TYPES, RANGE_MEMBERS } from "./log-publisher.js";

export const SERVER_SIMS_KEY = "AssociationofBlackComputerScient";

/* HELPER METHODS */
// Parses a new date from a string formatted as MM/DD/YYYY or "2024-04-18"
export function parseDateString(dateString: string) {
    try {
        const parts = dateString.split("/");
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    } catch(error) {
        return undefined;
    }
}

// Gets a string reflecting the semester of a date
// NOTE: Only Spring and Fall semester for now
export function getSemesterFromDate(date: Date) {
    const dateMonth = date.getMonth();

    let semester = "";
    if(dateMonth < 6) {
        semester = "Spring";
    } else {
        semester = "Fall"
    }

    return semester;
}

// Type guard that confirms whether a string is a MemberProperty or not
export function isMemberProperty(str: string): str is MemberProperty {
    return (str === "First Name" || str === "Last Name" || str === "UT EID" ||
            str === "Email" || str === "Phone Number" || str === "Birthday" ||
            str === "Major" || str === "Graduation Year");
}

// Extracts the matchings using a SIMS
// The same SIMS should return the same map
export function getQuestionDataFromSims(sims: string, key: string, iv: Buffer) {
    let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(sims, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return JSON.parse(decrypted) as QuestionData;
};

// Uses question data to generate a SIMS
// The same question data object should return the same SIMS
export function generateSims(data: QuestionData, key: string, iv: Buffer) {
    const jsonifiedData = JSON.stringify(data);
    let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(jsonifiedData, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
};

/* GROUP CLASS DEFINITION */
export class Group {
    id: number;
    name: string;
    logSheetURI: string;
    settings: GroupSettings;

    eventTypes: EventType[];
    events: Event[];
    members: GenericMap<Member>;
    numMembers: number;
    allOperations: Operations;
    
    // Creates an empty group
    constructor(id: number, settings: GroupSettings) {
        this.id = id;
        this.name = settings.name;
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.numMembers = 0;
        this.logSheetURI = settings.logSheetURI;
        this.allOperations = {};
        this.settings = settings;

        // Update settings
        if(this.settings.simsIV == "") 
            this.settings.simsIV = crypto.randomBytes(16).toString('base64');
    }

    // Gets SIMS from a QuestionData object based off this group's information
    getSims(data: QuestionData) {
        try {
            const ivBuffer = Buffer.from(this.settings.simsIV, 'base64');
            return generateSims(data, SERVER_SIMS_KEY, ivBuffer);
        } catch(e) {
            console.log("Error converting QuestionData to SIMS: " + e);
        }
        return undefined;
    }

    // Gets QuestionData from a SIMS object based off this group's information
    getQuestionDataFromSims(sims: string) {
        try {
            const ivBuffer = Buffer.from(this.settings.simsIV, 'base64');
            return getQuestionDataFromSims(sims, SERVER_SIMS_KEY, ivBuffer);
        } catch(e) {
            console.log("Error converting SIMS to QuestionData: " + e);
        }
        return undefined;
    }

    // Updates information for a single member based on a question from an event
    updateMemberInfoFromResponse(event: Event, member: Member, 
        questionId: string, answer: string) {
        const property = event.questionData.questionIdToPropertyMap[questionId];
        if(property != undefined) {
            if(property == "First Name" && member.firstName == "") {
                member.firstName = answer;
            } else if(property == "Last Name" && member.lastName == "") {
                member.lastName = answer;
            } else if(property == "UT EID" && member.utEID == "")  {
                member.utEID = answer;
            } else if(property == "Email" && member.email == "") {
                member.email = answer;
            } else if(property == "Phone Number" && member.phoneNumber == "") {
                member.phoneNumber = answer;
            } else if(property == "Birthday" && member.birthday == null) {
                member.birthday = new Date() // update this
            } else if(property == "Major" && member.major == "") {
                member.major = answer;
            } else if(property == "Graduation Year" && member.graduationYear == -1) {
                member.graduationYear = parseInt(answer);
            }
        }
    }

    // Empties and refreshes the event and membership information for this group
    async reset() {
        this.hardReset();
        await this.getLogInfo();
        return this.getEventData();
    }

    // Empties membership information and refreshes existing event information for
    // this group
    async softReset() {
        this.members = {};
        this.allOperations = {};
        this.numMembers = 0;

        // Clear membership information from events
        this.events.forEach(event => event.attendees = {});
        return this.getEventData();
    }

    // Clears all event and membership information
    hardReset() {
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.allOperations = {};
        this.numMembers = 0;
    }

    // Obtains the event data from the existing events in the group
    async getEventData() {
        // Go through the list of events, and update members accordingly
        const asyncTasks = []; // keep track of all async tasks
        this.events.forEach((event) => {
            const task = this.getMemberInfoFromEvent(event);
            asyncTasks.push(task);
        });

        // Wait for all async tasks to complete before returning
        await Promise.all(asyncTasks);
        return true;
    }

    // Adds information from the membership log to this group
    async getLogInfo() {
        const sheets = await getSheets();

        // Obtain metadata, list of event types, list of events, and existing members
        const res1 = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: this.logSheetURI,
            ranges: [
                RANGE_EVENT_TYPES, // event types
                RANGE_EVENTS  // events
                // RANGE_MEMBERS // members
            ],
        });
        
        // Retrieve event types from sheet data
        const eventTypes = res1.data.valueRanges[0];
        eventTypes.values?.forEach((row, index) => {
            const type: EventType = {
                id: index,
                name: row[1],
                points: parseInt(row[2])
            }
            this.eventTypes.push(type);
        });

        // Retrieve events from sheet data
        const events = res1.data.valueRanges[1];
        events.values?.forEach((row) => {
            const srcType: SourceType = SourceType[row[4] as string];

            // Get the question data for the event
            let questionData = row[6] != undefined ? 
                this.getQuestionDataFromSims(row[6]) : undefined;
            if(questionData == undefined) {
                questionData = {
                    questionIds: [],
                    questionIdToPropertyMap: {},
                    questionIdToQuestionMap: {}
                };
            }

            // Initialize an event object and add it to the list of events
            const event: Event = {
                eventName: row[1],
                semester: "",
                eventDate: row[2],
                source: row[3],
                sourceType: srcType,
                eventType: this.eventTypes[parseInt(row[5])],
                attendees: {},
                sims: row[6],
                questionData: questionData
            }
            this.events.push(event);
        });
    }

    // Adds an event to the spreadsheet if it's able to successfully
    // retrieve membership information from the event
    async addEvent(event: Event) {
        const success = await this.getMemberInfoFromEvent(event);
        if(success) {
            this.events.push(event);
        }
        return success;
    }

    /* GET MEMBER INFO METHODS */
    // Each method here must update membership based off of event information and 
    // preexisting question data

    // Gets member information for an event based on its source type
    async getMemberInfoFromEvent(event: Event) {
        const errorMessage = (error) => {
            console.log(`Error occurred while obtaining sheet info: ${error}`);
            console.log(`Event: ${event.eventName}; Type: ${event.sourceType}; `
                + `ID: ${event.source}`);
            return false;
        };

        // Based on the source type, determine how to collect member info
        let task: Promise<boolean>;
        if ( event.sourceType == SourceType.GoogleSheets ) {
            task = this.getMemberInfoFromSheets2(event)
                .catch(errorMessage);
        } else if ( event.sourceType == SourceType.GoogleForms ) {
            task = this.getMemberInfoFromForms2(event)
                .catch(errorMessage);
        }

        // Return the Promise so that it can be awaited for
        return task;
    }

    // Gets member information from an event with a source type of Google Sheets
    // question id = column # of the sheet
    async getMemberInfoFromSheets(event: Event) {
        const sheets = await getSheets();

        console.log(`get event ${event.eventName} from sheets`);
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: event.source,
            range: "A1:F"
        });

        res1.data.values.forEach((row, index) => {
            // Ignore the first row since it's just the title of the columns
            if( index == 0 ) return;

            // Retrieve member information
            let member: Member;
            const utEID = row[3];
            if(utEID in this.members) {
                member = this.members[utEID];
            } else {
                // Create new member and add them to the group
                member = {
                    firstName: row[1],
                    lastName: row[2],
                    utEID: utEID,
                    email: row[4],
                    phoneNumber: row[5],
                    memberID: this.numMembers,
                    graduationYear: 2022,
                    birthday: new Date(),
                    major: "Computer Science",
                    totalPoints: 0
                };
                this.numMembers++;
                this.members[utEID] = member;
            }

            // Update member if they haven't already been added to this event
            if(!(utEID in event.attendees)) {
                event.attendees[utEID] = member;
                member.totalPoints += event.eventType.points;
            }
        });

        return true;
    }

    // TESTING: USES QUESTION DATA
    // Gets member information from an event with a source type of Google Sheets
    // question id = column # of the sheet
    async getMemberInfoFromSheets2(event: Event) {
        const sheets = await getSheets();

        console.log(`get event ${event.eventName} from sheets`);
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: event.source,
            range: "A1:ZZ"
        });

        // Find which column corresponds to the UT EID
        let utEIDColumn = -1;
        for(const questionId in event.questionData.questionIdToPropertyMap) {
            const property = event.questionData.questionIdToPropertyMap[questionId];
            if(property == "UT EID") {
                utEIDColumn = parseInt(questionId);
            }
        }

        // If there's no UT EID column, discard
        if(utEIDColumn == -1) return;

        // Update members based on each row in the spreadsheet
        res1.data.values.forEach((row, index) => {
            // Ignore the first row since it's just the title of the columns
            if( index == 0 ) return;

            // Initialize the member
            let member: Member = {
                firstName: "",
                lastName: "",
                utEID: "",
                email: "",
                phoneNumber: "",
                memberID: this.numMembers,
                graduationYear: 0,
                birthday: new Date(),
                major: "",
                totalPoints: 0
            }

            // Check if it's a pre-existing member based on the UT EID response
            const utEID = row[utEIDColumn];
            if(utEID == "") {
                return; // Discard if there's no UT EID provided
            } else if(utEID in this.members) {
                member = this.members[utEID];
            } else {
                this.numMembers++;
                this.members[utEID] = member;
            }

            // Update member information based on values in the row
            row.forEach((val, rowIndex) => {
                this.updateMemberInfoFromResponse(event, member, `${rowIndex}`, val);
            });

            // Add member to event if they haven't already been added
            if(!(utEID in event.attendees)) {
                event.attendees[utEID] = member;
                member.totalPoints += event.eventType.points;
            }
        });

        return true;
    }

    // Gets member information from an event with a source type of Google Forms
    // question id = question id from forms
    async getMemberInfoFromForms(event: Event) {
        const forms = await getForms();
        console.log(`get event ${event.eventName} from forms`);

        // Obtain information from Google forms
        const res1 = await forms.forms.get({ // list of questions from forms
            formId: event.source
        });
        const res2 = await forms.forms.responses.list({ // list of responses from forms
            formId: event.source
        });

        // Map question IDs to questions
        let idToQuestionMap = {};
        res1.data.items.forEach((item) => {
            idToQuestionMap[item.questionItem.question.questionId] = item.title;
        });
        
        // Update membership information from each response
        res2.data.responses.forEach((response) => {
            // Go through each of the answers
            let firstName = "";
            let lastName = "";
            let utEID = "";
            let email = "";
            let phone = "";

            let member: Member = null;
            for( let questionId in response.answers ) {
                const question = idToQuestionMap[questionId];
                const answerObj = response.answers[questionId];
                const answer = answerObj.textAnswers.answers[0].value;
                
                if( question == "First Name" ) { firstName = answer; }
                else if( question == "Last Name" ) { lastName = answer; }
                else if( question == "UT EID" ) { 
                    utEID = answer; 
                    member = this.members[utEID]; 
                }
                else if( question == "Email" ) { email = answer; }
                else if( question == "Phone Number" ) { phone = answer; }
            }

            if( member == null && utEID != "" ) {
                member = {
                    firstName: firstName,
                    lastName: lastName,
                    utEID: utEID,
                    email: email,
                    phoneNumber: phone,
                    memberID: this.numMembers,
                    graduationYear: 0,
                    birthday: new Date(),
                    major: "Computer Science",
                    totalPoints: 0
                }
                this.members[utEID] = member;
            }
            member.totalPoints += event.eventType.points;
            event.attendees[utEID] = member;
        });

        return true;
    }

    // Gets member information from an event with a source type of Google Forms
    // question id = question id from forms
    async getMemberInfoFromForms2(event: Event) {
        const forms = await getForms();
        console.log(`get event ${event.eventName} from forms`);

        // Get the list of responses from Google Forms
        const res1 = await forms.forms.responses.list({
            formId: event.source
        });

        // Find which question ID corresponds to the UT EID
        let utEIDQuestionID = -1;
        for(const questionId in event.questionData.questionIdToPropertyMap) {
            const property = event.questionData.questionIdToPropertyMap[questionId];
            if(property == "UT EID") {
                utEIDQuestionID = parseInt(questionId);
            }
        }

        // If there's no UT EID question ID, discard
        if(utEIDQuestionID == -1) return;
        
        // Go through each of the answers and update member info
        res1.data.responses.forEach((response) => {
            // Initialize the member
            let member: Member = {
                firstName: "",
                lastName: "",
                utEID: "",
                email: "",
                phoneNumber: "",
                memberID: this.numMembers,
                graduationYear: 0,
                birthday: new Date(),
                major: "",
                totalPoints: 0
            }

            // Check if this response has a UT EID
            const answers = response.answers;
            if(!(utEIDQuestionID in response.answers)) {
                return; // Discard if there's no UT EID provided
            }
            
            // Check if it's a pre-existing member based on the UT EID response
            const utEID = response.answers[utEIDQuestionID].textAnswers.answers[0].value;
            if(utEID in this.members) {
                member = this.members[utEID];
            } else {
                this.numMembers++;
                this.members[utEID] = member;
            }

            // Update membership information based on responses
            for( let questionId in response.answers ) {
                const answerObj = response.answers[questionId];
                const answer = answerObj.textAnswers.answers[0].value;
                this.updateMemberInfoFromResponse(event, member, questionId, answer);
            }

            // Add member to event if they haven't already been added
            if(!(utEID in event.attendees)) {
                event.attendees[utEID] = member;
                member.totalPoints += event.eventType.points;
            }
        });

        return true;
    }
}