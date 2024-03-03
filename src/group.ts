// Handles all Group functionality, including updating logs and log operations
import { Event, EventType, SimpleMap, Member, SourceType, QuestionData } from "./interfaces.js";
import { OperationBuilder } from "./builders.js";
import { google, sheets_v4 } from "googleapis";
import { authorize } from "./google-client.js";
import { GaxiosResponse } from "gaxios";

// RANGES //
const RANGE_METADATA = "Metadata!A2:B";
const RANGE_EVENT_TYPES = "Event Log!A3:C";
const RANGE_EVENTS = "Event Log!E3:J";
const RANGE_MEMBERS = "Members!A3:K";

class SIMSGenerator {

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
    metadata!: SimpleMap<string, string>; // key-value map
    builders: SimpleMap<string, OperationBuilder> // maps a hash to a Builder

    constructor(id: number, name: string, logSheetURI: string) {
        this.id = id;
        this.name = name;
        this.logSheetURI = logSheetURI;
        this.memberKey = "utEID";
        this.simsGenerator = new SIMSGenerator();
        this.builders = {};

        this.refresh();
    }

    async refresh(): Promise<boolean> {
        this.eventTypes = [];
        this.events = [];
        this.members = {};
        this.metadata = {};
        this.numMembers = 0;

        // Obtain metadata, list of event types, list of events, and existing members
        console.log("Obtaining authorization");
        const auth = await authorize();
        const sheets = google.sheets({version: 'v4', auth});
        const res = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: this.logSheetURI,
            ranges: [
                RANGE_METADATA,  // metadata
                RANGE_EVENT_TYPES, // event types
                RANGE_EVENTS  // events
                // RANGE_MEMBERS // members
            ],
        });
        
        const metadata = res.data.valueRanges[0];
        metadata.values.forEach((row: string[]) => {
            this.metadata[row[0]] = row[1];
        });

        const eventTypes = res.data.valueRanges[1];
        eventTypes.values.forEach((row, index) => {
            const type: EventType = {
                id: index,
                name: row[1],
                points: parseInt(row[2])
            }
            this.eventTypes.push(type);
        });

        const events = res.data.valueRanges[2];
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
        this.events.forEach(async (event) => {
            try {
                if(event.sourceType == SourceType.GoogleSheets) {
                    console.log("get event " + event.eventName);
                    const res2 = await sheets.spreadsheets.values.get({
                        spreadsheetId: event.source,
                        range: "A1:F"
                    });
    
                    res2.data.values.forEach((row, index) => {
                        if(index > 0) {
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
                                    properties: {}
                                };
                                this.numMembers++;
                                this.members[row[3]] = member;
                            }
                            member.eventsAttended.push(event);
                            event.attendees.push(member);
                        }
                    });
                }
            } catch(error) {
                console.log("Error occurred while obtaining sheet info");
                console.log(`Event: ${event.eventName}; Sheet ID: ${event.source}`);
            }
        });

        for(let key in this.members) {
            const member = this.members[key];
        }

        this.postToLogs(sheets);

        return true; // successful refresh
    }

    ///// HELPER FUNCTIONS /////
    async postToLogs(sheets: sheets_v4.Sheets) {
        // Clear the information on the logs
        const res1 = await sheets.spreadsheets.values.batchClear({
            spreadsheetId: this.logSheetURI,
            requestBody: {
                ranges: [
                    RANGE_METADATA,
                    RANGE_EVENT_TYPES,
                    RANGE_EVENTS,
                    RANGE_MEMBERS
                ]
            }
        });

        // Initialize the values for each of the updated ranges
        let metadataValues = [];
        for(let key in this.metadata) {
            metadataValues.push([key, this.metadata[key]]);
        }

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

        let membersValues = [];
        membersValues.push([
            "ID",
            "First Name",
            "Last Name",
            "UT EID",
            "Email",
            "Phone Number",
            "Birthday",
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
                member.phoneNumber
            ]);
        }

        // Update the information on the logs with the new values
        const res2 = await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.logSheetURI,
            requestBody: {
                valueInputOption: "RAW",
                data: [
                    {
                        range: RANGE_METADATA,
                        values: metadataValues
                    },
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