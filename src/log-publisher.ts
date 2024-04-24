import { getSheets } from "./google-client.js";
import { Group } from "./group.js";
import { SourceType } from "./group-interfaces.js";

// RANGES //
export const RANGE_EVENT_TYPES = "Event Log!A3:C";
export const RANGE_EVENTS = "Event Log!E3:K";
export const RANGE_MEMBERS = "Members!A3:L";

// Updates the event & membership information in the group's log
export async function updateLogsForGroup(group: Group) {
    const sheets = await getSheets();

    // Clear the information on the logs
    await sheets.spreadsheets.values.batchClear({
        spreadsheetId: group.logSheetURI,
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
    group.eventTypes.forEach((eventType, index) => {
        eventTypesValues.push([index, eventType.name, eventType.points]);
    });

    let eventsValues = []
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
    }

    // Update the information on the logs with the new values
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: group.logSheetURI,
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