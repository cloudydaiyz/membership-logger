// Handles all Group functionality, including updating logs and log operations
import { Event, EventType, Member, SourceType, QuestionData, QuestionPropertyMatch, GroupSettings, GenericMap, MemberProperty } from "./group-interfaces.js";
import { DeleteEventTypeBuilder, OperationBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder } from "./group-operations.js";
import { google } from "googleapis";
import { getSheets, getForms } from "./google-client.js";
import { GaxiosResponse } from "gaxios";
import { GroupOutput, RANGE_EVENTS, RANGE_EVENT_TYPES, RANGE_GOOGLE_SHEETS_SIGN_IN, RANGE_MEMBERS } from "./log-publisher.js";
import { saveGroupSettings } from "./group-manager.js";
import { SERVER_SIMS_KEY } from "./secrets.js";
import dayjs, { Dayjs } from "dayjs";
import crypto from "crypto";

// Gets a string reflecting the semester of a date
// NOTE: Only Spring and Fall semester atm
export function getSemesterFromDate(date: Dayjs) {
    const dateMonth = date.month();

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

// Extracts the question data using a SIMS
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
    name: string;
    logSheetUri: string;
    settings: GroupSettings;
    logger: GroupOutput;

    // Event Data
    eventTypes: EventType[];
    events: Event[];
    members: GenericMap<Member>;
    numMembers: number;
    
    // Creates an empty group
    constructor(settings: GroupSettings) {
        this.name = settings.name;
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.numMembers = 0;
        this.logSheetUri = settings.logSheetUri;
        this.settings = settings;

        this.logger = new GroupOutput(this);

        // Update settings
        if(this.settings.simsIV == "") {
            this.settings.simsIV = crypto.randomBytes(16).toString("base64");
        }
    }

    // Gets SIMS from a QuestionData object based off this group's information
    getSims(data: QuestionData) {
        try {
            const ivBuffer = Buffer.from(this.settings.simsIV, "base64");
            return generateSims(data, SERVER_SIMS_KEY, ivBuffer);
        } catch(e) {
            this.logger.print("Error converting QuestionData to SIMS: " + e);
        }
        return undefined;
    }

    // Gets QuestionData from a SIMS object based off this group's information
    getQuestionDataFromSims(sims: string) {
        try {
            const ivBuffer = Buffer.from(this.settings.simsIV, "base64");
            return getQuestionDataFromSims(sims, SERVER_SIMS_KEY, ivBuffer);
        } catch(e) {
            this.logger.print("Error converting SIMS to QuestionData: " + e);
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
            } else if(property == "UT EID" && member.utEid == "")  {
                member.utEid = answer;
            } else if(property == "Email" && member.email == "") {
                member.email = answer;
            } else if(property == "Phone Number" && member.phoneNumber == "") {
                member.phoneNumber = answer;
            } else if(property == "Birthday" && member.birthday == null) {
                member.birthday = dayjs(answer); // update this
                if(!member.birthday.isValid()) member.birthday = undefined;
            } else if(property == "Major" && member.major == "") {
                member.major = answer;
            } else if(property == "Graduation Year" && member.graduationYear == 0) {
                member.graduationYear = parseInt(answer) || 0;
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
        this.numMembers = 0;
    }

    // Adds information from the membership log to this group
    async getLogInfo() {
        const sheets = await getSheets();

        // Obtain metadata, list of event types, list of events, and existing members
        const res1 = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: this.logSheetUri,
            ranges: [
                RANGE_EVENT_TYPES, // event types
                RANGE_EVENTS,  // events
                RANGE_MEMBERS // members
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
            let sims = row[6];
            let questionData = sims != undefined ? 
                this.getQuestionDataFromSims(sims) : undefined;
            if(questionData == undefined) {
                sims = "";
                questionData = {
                    questionIds: [],
                    questionIdToPropertyMap: {}
                };
            }

            // Initialize an event object and add it to the list of events
            const event: Event = {
                eventName: row[1],
                semester: "",
                eventDate: dayjs(row[2]),
                source: row[3],
                sourceType: srcType,
                eventType: this.eventTypes[parseInt(row[5])],
                attendees: {},
                sims: sims,
                questionData: questionData
            }
            this.events.push(event);
        });

        // Retrieve members from sheet data
        const members = res1.data.valueRanges[2];
        members.values?.forEach((row) => {
            const member: Member = {
                firstName: row[1],
                lastName: row[2],
                utEid: row[3],
                email: row[4],
                phoneNumber: row[5],
                memberId: this.numMembers,
                graduationYear: parseInt(row[8]) || 0,
                birthday: dayjs(row[6]),
                major: row[7],
                fallPoints: 0,
                springPoints: 0,
                totalPoints: 0
            }
            this.members[member.utEid] = member;
            this.numMembers++;
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

    // Obtains the event data from the existing events in the group
    async getEventData() {
        const asyncTasks = []; // keep track of all async tasks

        // Go through the list of events, and update members accordingly
        this.events.forEach((event) => {
            const task = this.getMemberInfoFromEvent(event);
            asyncTasks.push(task);
        });

        // Wait for all async tasks to complete before returning
        await Promise.all(asyncTasks);
        return true;
    }

    /* GET MEMBER INFO METHODS */
    // Each method here must update membership based off of event information and 
    // preexisting question data

    // Gets member information for an event based on its source type
    async getMemberInfoFromEvent(event: Event) {
        this.logger.print(`Obtaining member info from event ${event.eventName}`);
        const errorMessage = (error) => {
            this.logger.error(`Error occurred while obtaining event info: ${error}`);
            this.logger.error(`Event: ${event.eventName}; Type: ${event.sourceType}; `
                + `ID: ${event.source}`);
            return false;
        };

        // Based on the source type, determine how to collect member info
        let task: Promise<boolean>;
        if ( event.sourceType == SourceType.GoogleSheets ) {
            task = this.getMemberInfoFromSheets(event)
                .catch(errorMessage);
        } else if ( event.sourceType == SourceType.GoogleForms ) {
            task = this.getMemberInfoFromForms(event)
                .catch(errorMessage);
        }

        // Return the Promise so that it can be awaited for
        return task;
    }

    // Gets member information from an event with a source type of Google Sheets
    // question id = column # of the sheet
    async getMemberInfoFromSheets(event: Event) {
        this.logger.print(`Getting event ${event.eventName} from sheets`);
        const sheets = await getSheets();

        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: event.source,
            range: RANGE_GOOGLE_SHEETS_SIGN_IN
        });

        // Find which column corresponds to the UT EID
        let utEidColumn = -1;
        for(const questionId in event.questionData.questionIdToPropertyMap) {
            const property = event.questionData.questionIdToPropertyMap[questionId];
            if(property == "UT EID") {
                utEidColumn = parseInt(questionId);
            }
        }

        // If there's a UT EID column, update members based on each row in the spreadsheet
        if(utEidColumn != -1) {
            res1.data.values.forEach((row, index) => {
                // Ignore the first row since it's just the title of the columns
                if( index == 0 ) return;
    
                // Initialize the member
                let member: Member = {
                    firstName: "",
                    lastName: "",
                    utEid: "",
                    email: "",
                    phoneNumber: "",
                    memberId: this.numMembers,
                    graduationYear: 0,
                    birthday: null,
                    major: "",
                    fallPoints: 0,
                    springPoints: 0,
                    totalPoints: 0
                }
    
                // Check if it's a pre-existing member based on the UT EID response
                const utEID = row[utEidColumn];
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
                    
                    const semester = getSemesterFromDate(event.eventDate);
                    if(semester == "Fall") member.fallPoints += event.eventType.points;
                    if(semester == "Spring") member.springPoints += event.eventType.points;
                    member.totalPoints += event.eventType.points;
                }
            });
        }
        
        return true;
    }

    // Gets member information from an event with a source type of Google Forms
    // question id = question id from forms
    async getMemberInfoFromForms(event: Event) {
        this.logger.print(`Getting event ${event.eventName} from forms`);
        const forms = await getForms();

        // Get the list of responses from Google Forms
        const res1 = await forms.forms.responses.list({
            formId: event.source
        });

        // Find which question ID corresponds to the UT EID
        let utEidQuestionID = "";
        for(const questionId in event.questionData.questionIdToPropertyMap) {
            const property = event.questionData.questionIdToPropertyMap[questionId];
            if(property == "UT EID") {
                utEidQuestionID = questionId;
            }
        }

        // If there's a UT EID question ID, go through each of the answers and 
        // update member info
        if(utEidQuestionID != "") {
            res1.data.responses.forEach((response) => {
                let member: Member = {
                    firstName: "",
                    lastName: "",
                    utEid: "",
                    email: "",
                    phoneNumber: "",
                    memberId: this.numMembers,
                    graduationYear: 0,
                    birthday: null,
                    major: "",
                    fallPoints: 0,
                    springPoints: 0,
                    totalPoints: 0
                }
    
                // Check if this response has a UT EID, and discard if not
                if(!(utEidQuestionID in response.answers)) return;
                
                // Check if it's a pre-existing member based on the UT EID response
                const utEID = response.answers[utEidQuestionID].textAnswers.answers[0].value;
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

                    const semester = getSemesterFromDate(event.eventDate);
                    if(semester == "Fall") member.fallPoints += event.eventType.points;
                    if(semester == "Spring") member.springPoints += event.eventType.points;
                    member.totalPoints += event.eventType.points;
                }
            });
        }

        return true;
    }
}