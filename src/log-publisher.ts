import { getForms, getSheets } from "./google-client.js";
import { Group } from "./group.js";
import { Event, MemberProperty, QuestionPropertyMatch, SourceType } from "./group-interfaces.js";
import dayjs, { Dayjs } from "dayjs";

export const RANGE_EVENT_TYPES = "Event Log!A3:C";
export const RANGE_EVENTS = "Event Log!E3:K";
export const RANGE_MEMBERS = "Members!A4:L";
export const RANGE_EVENTS_ATTENDED = "Members!M2:ZZ";
export const RANGE_OUTPUT = "Output!A2:B";

export const RANGE_UPDATE_EVENT_TYPE_OP = "Event Log!N3:P5";
export const RANGE_DELETE_EVENT_TYPE_OP = "Event Log!N9:P10";
export const RANGE_UPDATE_EVENT_OP = "Event Log!N15:P20";
export const RANGE_DELETE_EVENT_OP = "Event Log!N28:P28";
export const RANGE_UPDATE_QUESTION_DATA_OP_1 = "Event Log!N33:P33";
export const RANGE_UPDATE_QUESTION_DATA_OP_2 = "Event Log!M40:P";

export const RANGE_GOOGLE_SHEETS_SIGN_IN = "A1:ZZ";
export const RANGE_GOOGLE_SHEETS_SIGN_IN_TITLES = "A1:ZZ1";

export const DATE_FORMAT = "MM/DD/YYYY";
export const SHEET_ID_EVENT_LOG = 0;
export const SHEET_ID_MEMBERS = 1851863886;
export const SHEET_ID_OUTPUT = 508001939;

// Updates the event & membership information in the group's log
export async function updateLogsForGroup(group: Group, includeEventTypes: boolean, 
    includeEvents: boolean) {
    const sheets = await getSheets();

    // Decide which information to update
    const rangesToClear = [];
    if(includeEventTypes) rangesToClear.push(RANGE_EVENT_TYPES);
    if(includeEvents) rangesToClear.push(RANGE_EVENTS);
    rangesToClear.push(RANGE_MEMBERS);
    rangesToClear.push(RANGE_EVENTS_ATTENDED);

    // Clear the information on the logs
    group.logger.log("UPDATE LOGS: Clearing logs...");
    const res1 = await sheets.spreadsheets.values.batchClear({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            ranges: rangesToClear
        }
    });

    // Initialize the values for each of the updated ranges
    const dataToUpdate = [];

    // Obtain the sheet values to update for event types if they're included
    if(includeEventTypes) {
        // We need to update the events anyways if we're updating event types
        includeEvents = true;

        let eventTypesValues = [];
        group.eventTypes.forEach((eventType, index) => {
            eventTypesValues.push([index, eventType.name, eventType.points]);
        });

        dataToUpdate.push({
            range: RANGE_EVENT_TYPES,
            values: eventTypesValues
        });
    }
    
    // Obtain the sheet values to update for events if they're included
    if(includeEvents) {
        let eventsValues = [];
        group.events.forEach((event, index) => {
            let sourceType;
            if(event.sourceType == SourceType.GoogleSheets) sourceType = "GoogleSheets";
            else if(event.sourceType == SourceType.GoogleForms) sourceType = "GoogleForms";

            eventsValues.push([
                index,
                event.eventName,
                event.eventDate.format(DATE_FORMAT),
                event.source,
                sourceType,
                event.eventType.id,
                event.sims
            ]);
        });

        dataToUpdate.push({
            range: RANGE_EVENTS,
            values: eventsValues
        });
    }

    // Initialize the sheet values to update for members
    let eventNames = [];
    let eventIds = [];
    group.events.forEach((event, index) => {
        eventNames.push(event.eventName);
        eventIds.push(index);
    });
    let eventsAttendedValues = [ eventNames, eventIds ];

    // Obtain the sheet values to update for members
    let membersValues = [];
    for(let key in group.members) {
        const member = group.members[key];
        membersValues.push([
            member.memberId,
            member.firstName,
            member.lastName,
            member.utEid,
            member.email,
            member.phoneNumber,
            member.birthday.format(DATE_FORMAT),
            member.major,
            member.graduationYear,
            member.fallPoints,
            member.springPoints,
            member.totalPoints
        ]);

        // Record the events that this member has attended as well
        let currentEventsAttended = [];
        group.events.forEach((event, index) => {
            if(member.utEid in event.attendees) {
                currentEventsAttended.push("X");
            } else {
                currentEventsAttended.push("");
            }
        });
        eventsAttendedValues.push(currentEventsAttended);
    }

    dataToUpdate.push({
        range: RANGE_MEMBERS,
        values: membersValues
    });
    dataToUpdate.push({
        range: RANGE_EVENTS_ATTENDED,
        values: eventsAttendedValues
    });

    // Update the information on the logs with the new values
    group.logger.log("UPDATE LOGS: Updating logs...")
    const res2 = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: dataToUpdate
        }
    });

    // Add formatting
    group.logger.log("UPDATE LOGS: Adding formatting...");
    const res3 = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            requests: [
                {
                    "autoResizeDimensions": {
                        "dimensions": {
                            "sheetId": SHEET_ID_MEMBERS,
                            "dimension": "COLUMNS",
                            "startIndex": 12,
                            "endIndex": 12 + group.events.length
                        }
                    }
                }
            ]
        }
    });

    group.logger.send();
    return true;
}

// Loads question data onto the log sheet for the group from Google Sheets
export async function loadQuestionDataFromGoogleSheets(group: Group, eventId: number, event: Event) {
    const sheets = await getSheets();

    // Get the first row of the spreadsheet -- those are the "questions" in this case
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: event.source,
        range: RANGE_GOOGLE_SHEETS_SIGN_IN_TITLES
    });

    // Create the 2D array for the question data to update the logs with
    const matchesToDisplay = [];
    res1.data.values[0].forEach((question, index) => {
        const questionId = `${index}`; // for clarity
        let property : MemberProperty;

        // Check if the question ID is in the question data for the current event
        const questionIdCheck = event.questionData.questionIds
            .findIndex(id => id == questionId);
        if(questionIdCheck != -1) {
            property = event.questionData.questionIdToPropertyMap[questionId];
        } else {
            property = "";
        }

        // Add the new match to the list of matches
        matchesToDisplay.push({
            question: question,
            questionId: questionId,
            property: property
        });
    });

    return finishLoadQuestionData(group, eventId, matchesToDisplay);
}

// Loads question data onto the log sheet for the group from Google Sheets
export async function loadQuestionDataFromGoogleForms(group: Group, eventId: number, event: Event) {
    const forms = await getForms();

    // Retreive all the questions from Google Forms
    const res1 = await forms.forms.get({ // list of questions from forms
        formId: event.source
    });

    // Create the 2D array for the question data to update the logs with
    const matchesToDisplay = [];
    res1.data.items.forEach(item => {
        const question = item.title;
        const questionId = item.questionItem.question.questionId;
        let property : MemberProperty;

        // Check if the question ID is in the question data for the current event
        const questionIdCheck = event.questionData.questionIds
            .findIndex(id => id == questionId);
        if(questionIdCheck != -1) {
            property = event.questionData.questionIdToPropertyMap[questionId];
        } else {
            property = "";
        }

        // Add the new match to the list of matches
        matchesToDisplay.push({
            question: question,
            questionId: questionId,
            property: property
        });
    });

    return finishLoadQuestionData(group, eventId, matchesToDisplay);
}

async function finishLoadQuestionData(group: Group, eventId: number, matchesToDisplay: any[]) {
    const sheets = await getSheets();

    // Clear the data in the logs with the previous input for question data
    const res1 = await sheets.spreadsheets.values.batchClear({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            ranges: [
                RANGE_UPDATE_QUESTION_DATA_OP_1,
                RANGE_UPDATE_QUESTION_DATA_OP_2,
            ]
        }
    });

    // Update the logs with the question data
    const values = [];
    const mergeRequests = [];
    matchesToDisplay.forEach((match, index) => {
        const currentRow = [];

        // Add the question, questionId, and property to the current row
        currentRow.push(match.question, "", match.questionId, match.property);
        values.push(currentRow);

        // Add a request to merge cells in column M and N for this row
        mergeRequests.push({
            mergeCells: {
                range: {
                    sheetId: 0,
                    startColumnIndex: 12,
                    endColumnIndex: 14,
                    startRowIndex: 39 + index,
                    endRowIndex: 40 + index
                }
            }
        });
    })

    // Update the cells
    const res2 = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: [
                {
                    range: RANGE_UPDATE_QUESTION_DATA_OP_1,
                    values: [[ eventId ]]
                },
                {
                    range: RANGE_UPDATE_QUESTION_DATA_OP_2,
                    values: values
                }
            ]
        }
    });

    // Add formatting
    const res3 = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: group.logSheetUri,
        requestBody: {
            requests: mergeRequests
        }
    });

    return true;
}

// Logs information to the output for a group
export class GroupOutput {
    groupId: number;
    groupSheetUri: string;
    capacity: number;     // max # of messages allowed in the log
    retainPeriod: number; // # of days each message in the log is retained
    toSend: string[];
    toSendTimestamps: Dayjs[];

    constructor(group: Group) {
        this.groupId = group.settings.id;
        this.groupSheetUri = group.logSheetUri;

        this.capacity = group.settings.outputCapacity;
        this.retainPeriod = group.settings.outputRetentionPeriod;
        this.toSend = [];
        this.toSendTimestamps = [];
    }

    // Prints a message to the terminal
    print(message: string) {
        console.log(`\x1b[33m\x1b[1mGROUP ${this.groupId}\x1b[0m | %s`, message);
    }

    // Prints an error to the terminal
    error(message: string) {
        console.log(`\x1b[31m\x1b[1mGROUP ${this.groupId}\x1b[0m | %s`, message);
    }

    // Adds a message to the list of messages to be sent to the log
    log(message: string) {
        console.log(`\x1b[36m\x1b[1mGROUP ${this.groupId}\x1b[0m | %s`, message);
        this.toSend.push(message);
        this.toSendTimestamps.push(dayjs());
    }

    // Sends all messages currently queued up to the log
    async send() {
        if(this.toSend.length == 0) return true; // nothing to send
        const sheets = await getSheets();

        // Generate the list of values to send
        const values = [];
        this.toSend.forEach((msg, index) => {
            values.push([this.toSendTimestamps[index].format(), msg]);
        });

        // Append the values to the output sheet
        const res1 = sheets.spreadsheets.values.append({
            spreadsheetId: this.groupSheetUri,
            range: RANGE_OUTPUT,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: values
            }
        });

        // Empty out the data to send
        this.toSend = [];
        this.toSendTimestamps = [];

        return true;
    }

    // Clears the first amount messages from the log
    async clear(amount: number) {
        const sheets = await getSheets();

        const res3 = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.groupSheetUri,
            requestBody: {
                requests: [
                    {
                        "deleteDimension": {
                            "range": {
                                "sheetId": SHEET_ID_OUTPUT,
                                "dimension": "ROWS",
                                "startIndex": 1,
                                "endIndex": 1 + amount
                            }
                        }
                    }
                ]
            }
        });

        return true;
    }

    // Ensures that the number of messages in the log don't exceed the capacity
    async maintainCapacity() {
        const sheets = await getSheets();

        // Check to see how many messages are currently in the log
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: this.groupSheetUri,
            range: RANGE_OUTPUT
        });
        let numMessages = res1.data.values.length;

        // If it's above capacity (capacity + X messages), delete the first X messages
        if(numMessages > this.capacity) {
            return this.clear(numMessages - this.capacity);
        }

        return true;
    }

    // Deletes messages that are over this.retainPeriod days old
    async deleteOldMessages() {
        const sheets = await getSheets();

        // Obtain messages from the sheet
        const res1 = await sheets.spreadsheets.values.get({
            spreadsheetId: this.groupSheetUri,
            range: RANGE_OUTPUT
        });

        // Iterate through the rows until there's a message to NOT delete
        const now = dayjs();
        let numToRemove = 0;
        res1.data.values.some((row, index) => {
            const date = dayjs(row[1]);
            if(!date.isValid() || date.diff(now, "days") > this.retainPeriod) { 
                numToRemove++;
                return false;
            }
            return true;
        });

        return this.clear(numToRemove);
    }
}