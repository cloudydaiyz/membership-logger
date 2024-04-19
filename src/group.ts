// Handles all Group functionality, including updating logs and log operations
import { Event, EventType, Member, SourceType, QuestionData, QuestionPropertyMatch, GroupSettings, GenericMap, MemberProperty } from "./interfaces.js";
import { OperationBuilder } from "./group-operations.js";
import { google } from "googleapis";
import { getSheets, getForms } from "./google-client.js";
import { GaxiosResponse } from "gaxios";
import crypto from "crypto";

// RANGES //
const RANGE_EVENT_TYPES = "Event Log!A3:C";
const RANGE_EVENTS = "Event Log!E3:J";
const RANGE_MEMBERS = "Members!A3:L";

export const SERVER_SIMS_KEY = "AssociationofBlackComputerScient";

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

class SIMSGenerator {
	// Extracts the matchings using a SIMS
	// The same SIMS should return the same map
	getQuestionDataFromSims(sims: string, key: string, iv: Buffer) {
        let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(sims, "hex", "utf-8");
        decrypted += decipher.final("utf-8");
        return JSON.parse(decrypted) as QuestionData;
    };
	
	// Uses question data to generate a SIMS
	// The same question data object should return the same SIMS
	generateSims(data: QuestionData, key: string, iv: Buffer) {
        const jsonifiedData = JSON.stringify(data);
        let cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
        let encrypted = cipher.update(jsonifiedData, "utf-8", "hex");
        encrypted += cipher.final("hex");
        return encrypted;
    };
}

export class Group {
    id: number;
    name: string;
    eventTypes: EventType[];
    events: Event[];
    members: GenericMap<Member>;
    numMembers: number;
    simsGenerator: SIMSGenerator;
    logSheetURI: string;
    builders: GenericMap<OperationBuilder> // maps a hash to a Builder
    settings: GroupSettings;

    constructor(id: number, settings: GroupSettings) {
        this.id = id;
        this.name = settings.name;
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.logSheetURI = settings.logSheetURI;
        this.simsGenerator = new SIMSGenerator();
        this.builders = {};
        this.settings = settings;

        // Update settings
        if(this.settings.simsIV == "") 
            this.settings.simsIV = crypto.randomBytes(16).toString();
    }

    async refresh(modifyLogSheet: boolean){
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.numMembers = 0;

        // Get existing event and membership information from the logs
        await this.getLogInfo();

        // Go through the list of events, and update members accordingly
        const asyncTasks = []; // keep track of all async tasks
        this.events.forEach((event) => {
            const task = this.getMemberInfoFromEvent(event);
            asyncTasks.push(task);
        });

        // Wait for all async tasks to complete before returning
        await Promise.all(asyncTasks);

        // Post the updated data to Google Sheets
        if( modifyLogSheet ) this.postToLogs(); 
        return true;
    }

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
        eventTypes.values.forEach((row, index) => {
            const type: EventType = {
                id: index,
                name: row[1],
                points: parseInt(row[2])
            }
            this.eventTypes.push(type);
        });

        // Retrieve events from sheet data
        const events = res1.data.valueRanges[1];
        events.values.forEach((row) => {
            let srcType: SourceType = SourceType[row[4] as string];
            // if(row[4] == "GoogleSheets") srcType = SourceType.GoogleSheets;
            // else if(row[4] == "GoogleForms") srcType = SourceType.GoogleForms;

            let questionData: QuestionData = {
                questionIds: [],
                questionIdToPropertyMap: {},
                questionIdToQuestionMap: {}
            };

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

    async getMemberInfoFromEvent(event: Event) {
        const errorMessage = (error) => {
            console.log(`Error occurred while obtaining sheet info: ${error}`);
            console.log(`Event: ${event.eventName}; Type: ${event.sourceType}; ID: ${event.source}`);
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

    // Get member info methods //
    /* Each method here must:
     * Update membership based off of event information and *preexisting
     * question data* (* = TBD)
     */
    async getMemberInfoFromSheets(event: Event) {
        const sheets = await getSheets();

        console.log(`get event ${event.eventName} from sheets`);
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: event.source,
            range: "A1:F"
        });

        res1.data.values.forEach((row, index) => {
            // Ignore the first row since it's just the title of the columns
            if( index == 0 ) {
                return;
            }

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
                    eventsAttended: [],
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
                member.eventsAttended.push(event);
                event.attendees[utEID] = member;
                member.totalPoints += event.eventType.points;
            }
        });

        return true;
    }

    async getMemberInfoFromForms(event: Event) {
        const forms = await getForms();

        console.log(`get event ${event.eventName} from forms`);
        const res1 = await forms.forms.get({
            formId: event.source
        });

        let idToQuestionMap = {};
        res1.data.items.forEach((item) => {
            idToQuestionMap[item.questionItem.question.questionId] = item.title;
        });

        const res2 = await forms.forms.responses.list({
            formId: event.source
        });
        
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
                    eventsAttended: [],
                    memberID: this.numMembers,
                    graduationYear: 0,
                    birthday: new Date(),
                    major: "Computer Science",
                    totalPoints: 0
                }
                this.members[utEID] = member;
            }

            member.eventsAttended.push(event);
            member.totalPoints += event.eventType.points;
            event.attendees[utEID] = member;
        });

        return true;
    }

    async postToLogs() {
        const sheets = await getSheets();

        // Clear the information on the logs
        await sheets.spreadsheets.values.batchClear({
            spreadsheetId: this.logSheetURI,
            requestBody: {
                ranges: [
                    RANGE_EVENT_TYPES,
                    RANGE_EVENTS,
                    RANGE_MEMBERS
                ]
            }
        });

        // Initialize the values for each of the updated ranges
        let eventTypesValues = []
        this.eventTypes.forEach((eventType, index) => {
            eventTypesValues.push([index, eventType.name, eventType.points]);
        });

        let eventsValues = []
        this.events.forEach((event, index) => {
            let sourceType;
            if(event.sourceType == SourceType.GoogleSheets) sourceType = "GoogleSheets";
            else if(event.sourceType == SourceType.GoogleForms) sourceType = "GoogleForms";

            eventsValues.push([
                index,
                event.eventName,
                event.eventDate.toString(),
                event.source,
                sourceType,
                event.eventType.id
            ]);
        });

        // For members, have the first row be the column names, and the
        // remaining rows be the member information
        let membersValues = [];
        membersValues.push([
            "ID",
            "First Name",
            "Last Name",
            "UT EID",
            "Email",
            "Phone Number",
            "Birthday",
            "Major",
            "Graduation Year",
            "Fall Semester Points",
            "Spring Semester Points",
            "Total Points"
        ]);

        for(let key in this.members) {
            const member = this.members[key];
            membersValues.push([
                member.memberID,
                member.firstName,
                member.lastName,
                member.utEID,
                member.email,
                member.phoneNumber,
                member.birthday.toString(),
                member.major,
                member.graduationYear,
                member.totalPoints,
                member.totalPoints,
                member.totalPoints
            ]);
        }

        // Update the information on the logs with the new values
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.logSheetURI,
            requestBody: {
                valueInputOption: "RAW",
                data: [
                    {
                        range: RANGE_EVENT_TYPES,
                        values: eventTypesValues
                    },
                    {
                        range: RANGE_EVENTS,
                        values: eventsValues
                    },
                    {
                        range: RANGE_MEMBERS,
                        values: membersValues
                    },
                ]
            }
        });
    }

    // Gets SIMS from a QuestionData object based off this group's information
    getSims(data: QuestionData) {
        const ivBuffer = Buffer.from(this.settings.simsIV, 'utf-8');
        return this.simsGenerator.generateSims(data, SERVER_SIMS_KEY, ivBuffer);
    }

    // Gets QuestionData from a SIMS object based off this group's information
    getQuestionDataFromSims(sims: string) {
        const ivBuffer = Buffer.from(this.settings.simsIV, 'utf-8');
        return this.simsGenerator.getQuestionDataFromSims(sims, SERVER_SIMS_KEY, ivBuffer);
    }
}