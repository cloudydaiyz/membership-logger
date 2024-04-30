import { getForms, getSheets } from "./google-client.js";
import { Group } from "./group.js";
import { Event, SourceType } from "./group-interfaces.js";

// RANGE CONSTANTS //
export const RANGE_EVENT_TYPES = "Event Log!A3:C";
export const RANGE_EVENTS = "Event Log!E3:K";
export const RANGE_MEMBERS = "Members!A4:L";
export const RANGE_EVENTS_ATTENDED = "Members!M2:ZZ";

export const RANGE_UPDATE_EVENT_TYPE_OP = "Event Log!N3:P5";
export const RANGE_DELETE_EVENT_TYPE_OP = "Event Log!N9:P10";
export const RANGE_UPDATE_EVENT_OP = "Event Log!N15:P20";
export const RANGE_DELETE_EVENT_OP = "Event Log!N27:P27";
export const RANGE_UPDATE_QUESTION_DATA_OP_1 = "Event Log!N32:P32";
export const RANGE_UPDATE_QUESTION_DATA_OP_2 = "Event Log!M39:P";

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
    const res1 = await sheets.spreadsheets.values.batchClear({
        spreadsheetId: group.logSheetURI,
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
                event.eventDate.toString(),
                event.source,
                sourceType,
                event.eventType.id
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

        // Record the events that this member has attended as well
        let currentEventsAttended = [];
        group.events.forEach((event, index) => {
            if(member.utEID in event.attendees) {
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
    const res2 = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: group.logSheetURI,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: dataToUpdate
        }
    });

    return true;
}

// Loads question data onto the log sheet for the group from Google Sheets
export async function loadQuestionDataFromGoogleSheets(group: Group, eventID: number, event: Event) {
    const sheets = await getSheets();

    // Get the first row of the spreadsheet -- those are the "questions" in this case
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: event.source,
        range: "A1:ZZ1"
    });

    // Create the 2D array for the question data to update the logs with
    const questionDataValues: any[][] = [];
    res1.data.values[0].forEach((question, index) => {
        const questionId = `${index}`; // for clarity
        const currentRow = [];

        // Add the question, questionId, and property to the current row
        currentRow.push(question, "", questionId);

        // Check if the question ID is in the question data for the current event
        const questionIdCheck = event.questionData.questionIds
            .findIndex(id => id == questionId);
        if(questionIdCheck != -1) {
            currentRow.push(event.questionData.questionIdToPropertyMap[questionId]);
        } else {
            currentRow.push(""); // empty cell
        }

        questionDataValues.push(currentRow);
    });

    return await finishLoadQuestionData(group, eventID, questionDataValues);
}

// Loads question data onto the log sheet for the group from Google Sheets
export async function loadQuestionDataFromGoogleForms(group: Group, eventID: number, event: Event) {
    const forms = await getForms();

    // Retreive all the questions from Google Forms
    const res1 = await forms.forms.get({ // list of questions from forms
        formId: event.source
    });

    // Create the 2D array for the question data to update the logs with
    const questionDataValues: any[][] = [];
    res1.data.items.forEach(item => {
        const question = item.title;
        const questionId = item.questionItem.question.questionId;
        const currentRow = [];

        // Add the question, questionId, and property to the current row
        currentRow.push(question, "", questionId);

        // Check if the question ID is in the question data for the current event
        const questionIdCheck = event.questionData.questionIds
            .findIndex(id => id == questionId);
        if(questionIdCheck != -1) {
            currentRow.push(event.questionData.questionIdToPropertyMap[questionId]);
        } else {
            currentRow.push(""); // empty cell
        }

        questionDataValues.push(currentRow);
    });

    return await finishLoadQuestionData(group, eventID, questionDataValues);
}

async function finishLoadQuestionData(group: Group, eventID: number, values: any[][]) {
    const sheets = await getSheets();

    // Clear the data in the logs with the previous input for question data
    const res2 = await sheets.spreadsheets.values.batchClear({
        spreadsheetId: group.logSheetURI,
        requestBody: {
            ranges: [
                RANGE_UPDATE_QUESTION_DATA_OP_1,
                RANGE_UPDATE_QUESTION_DATA_OP_2,
            ]
        }
    });

    // Update the logs with the question data
    const res3 = await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: group.logSheetURI,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: [
                {
                    range: RANGE_UPDATE_QUESTION_DATA_OP_1,
                    values: [[ eventID ]]
                },
                {
                    range: RANGE_UPDATE_QUESTION_DATA_OP_2,
                    values: values
                }
            ]
        }
    });

    return true;
}