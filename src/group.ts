// Handles all Group functionality, including updating logs and log operations
import { Event, EventType, SimpleMap, Member, SourceType, QuestionData, QuestionPropertyMatch, GroupSettings } from "./interfaces.js";
import { OperationBuilder } from "./group-operations.js";
import { forms_v1, google, sheets_v4 } from "googleapis";
import { authorize } from "./google-client.js";
import { GaxiosResponse } from "gaxios";
import crypto from "crypto";

// RANGES //
const RANGE_EVENT_TYPES = "Event Log!A3:C";
const RANGE_EVENTS = "Event Log!E3:J";
const RANGE_MEMBERS = "Members!A3:L";

export const SERVER_SIMS_KEY = "AssociationofBlackComputerScient";

const MODIFY_SHEET = true;

class SIMSGenerator {
    // Creates a new matching from a Dictionary containing mappings between questions
	// and member properties
	// exampleInput = [
	// 	{
	// 		"question": "What is your first name?",
	//		"questionId": "b9aef127",
	//		"property": "First Name"
	// 	},
	// 	{
	// 		"question": "What year will you graduate?",
	//    "questionId": "a123948f",
	// 		"property": "Grad Year"
	// 	}
	// 	...
	// ]
	// returns: a map between question IDs and member properties
	createMatching(matchings: QuestionPropertyMatch[]): QuestionData {
        const data: QuestionData = {
            questionIdToPropertyMap: {},
            questionToIdMap: {}
        }
        matchings.forEach((matching) => {
            data.questionIdToPropertyMap[matching.questionId] = matching.property;
            data.questionToIdMap[matching.question] = matching.questionId;
        });
        return data;
    };
	
	// Extracts the matchings using a SIMS
	// The same SIMS should return the same map
	// returns: a map between question IDs and member properties
	extractMatching(sims: string, key: string, iv: Buffer): QuestionData {
        let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(sims, "hex", "utf-8");
        decrypted += decipher.final("utf-8");
        return JSON.parse(decrypted);
    };
	
	// Use a matching to generate a SIMS
	// The same map should return the same SIMS
	// returns: the SIMS string
	generateSims(data: QuestionData, key: string, iv: Buffer): string {
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
    eventTypes!: EventType[];
    events!: Event[];
    members!: SimpleMap<string, Member>;
    memberKey: string;
    numMembers: number;
    simsGenerator: SIMSGenerator;
    logSheetURI: string;
    builders: SimpleMap<string, OperationBuilder> // maps a hash to a Builder
    settings: GroupSettings;

    constructor(id: number, settings: GroupSettings) {
        this.id = id;
        this.name = settings.name;
        this.logSheetURI = settings.logSheetURI;
        this.memberKey = "utEID";
        this.simsGenerator = new SIMSGenerator();
        this.builders = {};
        this.settings = settings;

        // Update settings
        if(this.settings.simsIV == "") 
            this.settings.simsIV = crypto.randomBytes(16).toString();

        // this.refresh();
    }

    async refresh(): Promise<boolean> {
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.numMembers = 0;

        // Obtain authorization and intialize the Google Sheets client
        console.log("Obtaining authorization");
        const auth = await authorize();
        const sheets = google.sheets({version: 'v4', auth});
        const forms = google.forms({version: 'v1', auth});

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
            let srcType: SourceType;
            if(row[4] == "GoogleSheets") srcType = SourceType.GoogleSheets;
            else if(row[4] == "GoogleForms") srcType = SourceType.GoogleForms;

            let questionData: QuestionData = {
                questionIdToPropertyMap: {},
                questionToIdMap: {}
            };

            const event: Event = {
                eventName: row[1],
                eventDate: row[2],
                source: row[3],
                sourceType: srcType,
                eventType: this.eventTypes[parseInt(row[5])],
                attendees: [],
                sims: row[6],
                lastUpdated: row[7],
                questionData: questionData,
                memberProperties: []
            }

            this.events.push(event);
        });

        // Go through the list of events, and update members accordingly
        const asyncTasks = []; // keep track of all async tasks
        this.events.forEach((event) => {
            const errorMessage = (error) => {
                console.log("Error occurred while obtaining sheet info");
                console.log(`Event: ${event.eventName}; Type: ${event.sourceType}; ID: ${event.source}`);
            };

            if ( event.sourceType == SourceType.GoogleSheets ) {
                const task = this.getEventInfoFromSheets(sheets, event)
                    .catch(errorMessage); //.then(updateCount);
                asyncTasks.push(task);
            } else if ( event.sourceType == SourceType.GoogleForms ) {
                const task = this.getEventInfoFromForms(forms, event)
                    .catch(errorMessage); //.then(updateCount);
                asyncTasks.push(task);
            }
        });

        // Wait for all async tasks to complete before returning
        await Promise.all(asyncTasks);

        // Post the updated data to Google Sheets
        if( MODIFY_SHEET ) this.postToLogs(sheets); 
        return true;
    }

    ///// HELPER FUNCTIONS /////
    async getEventInfoFromSheets(sheets: sheets_v4.Sheets, event: Event) {
        console.log(`get event ${event.eventName} from sheets`);
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: event.source,
            range: "A1:F"
        });

        res1.data.values.forEach((row, index) => {
            if( index == 0 ) {
                // do stuff
                return;
            }

            let member: Member;

            if(row[3] in this.members) {
                member = this.members[row[3]];
            } else {
                member = {
                    firstName: row[1],
                    lastName: row[2],
                    utEID: row[3],
                    email: row[4],
                    phoneNumber: row[5],
                    eventsAttended: [],
                    memberID: this.numMembers,
                    graduationYear: 2022,
                    birthday: new Date(),
                    properties: {},
                    totalPoints: 0
                };
                this.numMembers++;
                this.members[row[3]] = member;
            }
            member.eventsAttended.push(event);
            member.totalPoints += event.eventType.points;
            event.attendees.push(member);
        });
    }

    async getEventInfoFromForms(forms: forms_v1.Forms, event: Event) {
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
                    properties: {},
                    totalPoints: 0
                }
                this.members[utEID] = member;
            }

            member.eventsAttended.push(event);
            member.totalPoints += event.eventType.points;
            event.attendees.push(member);
        });
    }

    async postToLogs(sheets: sheets_v4.Sheets) {
        // Clear the information on the logs //
        const res1 = await sheets.spreadsheets.values.batchClear({
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
                "Blah",
                member.graduationYear,
                member.totalPoints,
                member.totalPoints,
                member.totalPoints
            ]);
        }

        // Update the information on the logs with the new values
        const res2 = await sheets.spreadsheets.values.batchUpdate({
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
}