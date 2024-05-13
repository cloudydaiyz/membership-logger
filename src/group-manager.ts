// Provides the Model for interacting with Groups
import * as fs from "node:fs/promises";
import { Group, isMemberProperty } from "./group.js";
import { GroupSettings, GroupMap, QuestionPropertyMatch, SourceType } from "./group-interfaces.js";
import { GROUPS_PATH } from "./app.js";
import { RANGE_DELETE_EVENT_OP, RANGE_DELETE_EVENT_TYPE_OP, RANGE_UPDATE_EVENT_OP, RANGE_UPDATE_EVENT_TYPE_OP, RANGE_LOAD_QUESTION_DATA_OP, RANGE_UPDATE_QUESTION_DATA_OP, loadQuestionDataFromGoogleForms, loadQuestionDataFromGoogleSheets, updateLogsForGroup, finishLoadEventType, RANGE_LOAD_EVENT_TYPE_OP, finishLoadEvent, RANGE_LOAD_EVENT_OP } from "./log-publisher.js";
import { DeleteEventBuilder, DeleteEventTypeBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder } from "./group-operations.js";
import { getSheets } from "./google-client.js";
import { UPDATE_LOGS } from "./app.js";

export const groups: GroupMap = {};

// Initializes the groups based on the settings
export async function initGroups(groupList?: Group[], groupListAppend?: boolean) {
    console.log("Initializing groups...");

    if(groupList) {
        for(const group of groupList) {
            await group.reset();
            groups[group.settings.id] = group;
        }

        // If we're not appending the list of groups, but replacing, stop here
        if(groupListAppend == false) return;
    }

    // Obtain the settings for each group from the config file
    const rawGroupSettings = await fs.readFile(GROUPS_PATH);
    const groupSettings = JSON.parse(String(rawGroupSettings)) as GroupSettings[];

    // Keep track of the tasks from refreshing each new group
    const refreshGroupTasks = [];
    
    // Create groups from each of the settings
    for(const settings of groupSettings) {
        const group = new Group(settings);
        groups[settings.id] = group;

        refreshGroupTasks.push(group.reset().then(res => {
            if(res && UPDATE_LOGS) {
                return updateLogsForGroup(group, true, true);
            }
            return res;
        }));
    }

    await Promise.all(refreshGroupTasks);
    await saveGroupSettings();
}

// Saves the list of settings to the groups.json file
export async function saveGroupSettings() {
    console.log("Saving group settings...");

    const allSettings = [];
    for(const groupId in groups) {
        allSettings.push(groups[groupId].settings);
    } 

    const groupSettingsString = JSON.stringify(allSettings, null, 4);
    await fs.writeFile(GROUPS_PATH, groupSettingsString);
}

// Retrieves all the groups currently stored by the app
export async function getAllGroups() {
    return groups;
}

// Retrieves the group with the specified group ID
export async function getGroup(groupID: number) {
    return groups[groupID];
}

// Refreshes all the groups stored in the app
export async function refreshAllGroups() {
    const refreshTasks = [];
    const refreshLogsTasks = [];

    for(const groupId in groups) {
        const group = groups[groupId];
        refreshTasks.push(refreshGroup(Number(groupId)));

        // Update the logs and output after the group has refreshed
        if(UPDATE_LOGS) {
            refreshLogsTasks.push(updateLogsForGroup(group, true, true));
        }
        refreshLogsTasks.push(group.logger.maintainCapacity());
        refreshLogsTasks.push(group.logger.deleteOldMessages());
    }
    
    await Promise.all(refreshTasks);
    await Promise.all(refreshLogsTasks);
}

// Refreshes the information for a group
export async function refreshGroup(groupId: number) {
    const group = groups[groupId];

    group.logger.log("REFRESH GROUP: Refreshing group...");
    return group.reset().then(res => {
        if(res && UPDATE_LOGS) {
            group.logger.log("REFRESH GROUP: Refresh successful, now updating logs");
            group.logger.send();
            return updateLogsForGroup(group, true, true);
        } else if(!res) {
            group.logger.log("REFRESH GROUP: Refresh unsuccessful");
        }

        group.logger.send();
        return res;
    });
}

// Loads information for an event type into a group's log
export async function loadEventType(groupId: number, eventTypeId: number) {
    const group = groups[groupId];
    return finishLoadEventType(group, eventTypeId);
}

export async function loadEventTypeFromLog(groupId: number) {
    const group = groups[groupId];
    const sheets = await getSheets();

    group.logger.log("LOAD EVENT TYPE: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        range: RANGE_LOAD_EVENT_TYPE_OP
    });

    // Validate values
    const inputs = res1.data.values?.[0];
    if(!inputs) {
        group.logger.log("LOAD EVENT TYPE ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const eventTypeId = inputs[0] != "" ? Number(inputs[0]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventTypeId) || eventTypeId < -1 || eventTypeId >= group.eventTypes.length) {
        group.logger.log(`LOAD EVENT TYPE ERROR: Event Type ID must be a number 
            between 0 and ${group.eventTypes.length - 1}.`);
        group.logger.send();
        return false;
    }

    group.logger.log("LOAD EVENT TYPE: Successfully obtained log info");
    return loadEventType(groupId, eventTypeId);
}

// Creates or updates the event type for the group
export async function updateEventType(groupId: number, typeId: number, 
    typeName: string, points: number) {
    const group = groups[groupId];
    const builder = new UpdateEventTypeBuilder(group);
    builder.typeId = typeId;
    builder.typeName = typeName;
    builder.points = points;
    
    group.logger.log("UPDATE EVENT TYPE: Performing operation...");
    return builder.build().then(res => {
        if(res) {
            group.logger.log("UPDATE EVENT TYPE: Operation successful");

            if(UPDATE_LOGS) {
                group.logger.log("UPDATE EVENT TYPE: Now updating logs...");
                group.logger.send();
                return updateLogsForGroup(group, true, true);
            }
        } 
        else group.logger.log("UPDATE EVENT TYPE: Operation unsuccessful");

        group.logger.send();
        return res;
    });
}

// Updates the event type using information from the group's log
export async function updateEventTypeFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("UPDATE EVENT TYPE: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: group.logSheetUri,
        majorDimension: "COLUMNS",
        ranges: [ RANGE_LOAD_EVENT_TYPE_OP, RANGE_UPDATE_EVENT_TYPE_OP ]
    });

    // Validate value ranges
    const inputs1 = res1.data.valueRanges?.[0].values?.[0];
    const inputs2 = res1.data.valueRanges?.[1]?.values?.[0];
    if(!inputs2 || inputs2.length != 2) {
        group.logger.log("UPDATE EVENT TYPE ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const typeId = inputs1 && inputs1[0] != "" ? Number(inputs1[0]) : -1;
    const eventType = inputs2[0];
    const points = inputs2[1] != "" ? Number(inputs2[1]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(typeId) || typeId < -1 || typeId >= group.eventTypes.length) {
        group.logger.log(`UPDATE EVENT TYPE ERROR: Event Type ID must be a number 
            between 0 and ${group.eventTypes.length - 1}.`);
        group.logger.send();
        return false;
    }
    if(Number.isNaN(points)) {
        group.logger.log("UPDATE EVENT TYPE ERROR: Points must be a number.");
        group.logger.send();
        return false;
    }

    group.logger.log("UPDATE EVENT TYPE: Successfully obtained log info");
    return updateEventType(groupId, typeId, eventType, points);
}

// Deletes an event type for the group
export async function deleteEventType(groupID: number, typeIdtoRemove: number, 
    typeIdtoReplace: number) {
    const group = groups[groupID];
    const builder = new DeleteEventTypeBuilder(group);
    builder.typeIdtoRemove = typeIdtoRemove;
    builder.typeIdtoReplace = typeIdtoReplace;
    
    group.logger.log("DELETE EVENT TYPE: Performing operation...");
    return builder.build().then(res => {
        if(res) {
            group.logger.log("DELETE EVENT TYPE: Operation successful");

            if(UPDATE_LOGS) {
                group.logger.log("DELETE EVENT TYPE: Now updating logs...");
                group.logger.send();
                return updateLogsForGroup(group, true, true);
            }
        } 
        else group.logger.log("DELETE EVENT TYPE: Operation unsuccessful");

        group.logger.send();
        return res;
    });
}

export async function deleteEventTypeFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("DELETE EVENT TYPE: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        majorDimension: "COLUMNS",
        range: RANGE_DELETE_EVENT_TYPE_OP
    });

    // Validate values
    const inputs = res1.data.values?.[0];
    if(!inputs || inputs.length != 2) {
        group.logger.log("DELETE EVENT TYPE ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const toRemove = inputs[0] != "" ? Number(inputs[0]) : -1;
    const toReplace = inputs[1] != "" ? Number(inputs[1]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(toRemove) || toRemove < -1 || toRemove >= group.eventTypes.length) {
        group.logger.log(`DELETE EVENT TYPE ERROR: Event Type ID to Remove must be a number 
            between 0 and ${group.eventTypes.length - 1}.`);
        group.logger.send();
        return false;
    }
    if(Number.isNaN(toReplace) || toReplace < -1 || toReplace >= group.eventTypes.length) {
        group.logger.log(`DELETE EVENT TYPE ERROR: Event Type ID to Replace must be a number 
            between 0 and ${group.eventTypes.length - 1}.`);
        group.logger.send();
        return false;
    }

    group.logger.log("DELETE EVENT TYPE: Successfully obtained log info");
    return deleteEventType(groupId, toRemove, toReplace);
}

// Loads information for an event into a group's log
export async function loadEvent(groupId: number, eventTypeId: number) {
    const group = groups[groupId];
    return finishLoadEvent(group, eventTypeId);
}

export async function loadEventFromLog(groupId: number) {
    const group = groups[groupId];
    const sheets = await getSheets();

    group.logger.log("LOAD EVENT: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        range: RANGE_LOAD_EVENT_OP
    });

    // Validate values
    const inputs = res1.data.values?.[0];
    if(!inputs) {
        group.logger.log("LOAD EVENT ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const eventId = inputs[0] != "" ? Number(inputs[0]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventId) || eventId < -1 
        || eventId >= group.events.length) {
        group.logger.log(`LOAD EVENT ERROR: Event ID must be a number 
            between 0 and ${group.events.length - 1}.`);
        group.logger.send();
        return false;
    }

    group.logger.log("LOAD EVENT: Successfully obtained log info");
    return loadEvent(groupId, eventId);
}

// Creates or updates an event for the group
export async function updateEvent(groupId: number, eventId: number, 
    eventTitle: string, rawEventDate: string, source: string, sourceType: string, 
    eventTypeId: number) {
    const group = groups[groupId];
    const builder = new UpdateEventBuilder(group);
    builder.eventId = eventId;
    builder.eventTitle = eventTitle;
    builder.rawEventDate = rawEventDate;
    builder.source = source;
    builder.sourceType = sourceType;
    builder.eventTypeId = eventTypeId;

    group.logger.log("UPDATE EVENT: Performing operation...");
    return builder.build().then(res => {
        if(res) {
            group.logger.log("UPDATE EVENT: Operation successful");

            if(UPDATE_LOGS) {
                group.logger.log("UPDATE EVENT: Now updating logs...");
                group.logger.send();
                return updateLogsForGroup(group, false, true);
            }
        } 
        else group.logger.log("UPDATE EVENT: Operation unsuccessful");

        group.logger.send();
        return res;
    });
}

export async function updateEventFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("UPDATE EVENT: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: group.logSheetUri,
        majorDimension: "COLUMNS",
        ranges: [ RANGE_LOAD_EVENT_OP, RANGE_UPDATE_EVENT_OP ]
    });

    // Validate the value ranges
    const inputs1 = res1.data.valueRanges?.[0].values[0];
    const inputs2 = res1.data.valueRanges?.[1]?.values[0];
    if(!inputs2 || inputs2.length != 5) {
        group.logger.log("UPDATE EVENT ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const eventId = inputs1 && inputs1[0] != "" ? Number(inputs1[0]) : -1;
    const eventTitle = inputs2[0];
    const eventDate = inputs2[1];
    const source = inputs2[2];
    const sourceType = inputs2[3];
    const eventTypeId = inputs2[4] != "" ? Number(inputs2[4]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventId) || eventId < -1 || eventId >= group.events.length) {
        group.logger.log(`UPDATE EVENT ERROR: Event ID must be a number 
            between 0 and ${group.events.length - 1}.`);
        group.logger.send();
        return false;
    }
    if(Number.isNaN(eventTypeId) || eventTypeId < -1 || eventTypeId >= group.eventTypes.length) {
        group.logger.log(`UPDATE EVENT ERROR: Event Type ID must be a number 
            between 0 and ${group.eventTypes.length - 1}.`);
        group.logger.send();
        return false;
    }

    group.logger.log("UPDATE EVENT: Successfully obtained log info");
    return updateEvent(groupId, eventId, eventTitle, eventDate, source, sourceType, eventTypeId);
}

// Deletes the event for the group
export async function deleteEvent(groupId: number, eventId: number) {
    const group = groups[groupId];
    const builder = new DeleteEventBuilder(group);
    builder.eventId = eventId;

    group.logger.log("DELETE EVENT: Performing operation...");
    return builder.build().then(res => {
        if(res) {
            group.logger.log("DELETE EVENT: Operation successful");

            if(UPDATE_LOGS) {
                group.logger.log("DELETE EVENT: Now updating logs...");
                group.logger.send();
                return updateLogsForGroup(group, false, true);
            }
        }
        else group.logger.log("DELETE EVENT: Operation unsuccessful");

        group.logger.send();
        return res;
    });
}

export async function deleteEventFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("DELETE EVENT: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        range: RANGE_DELETE_EVENT_OP
    });

    // Validate values
    const inputs = res1.data.values?.[0];
    if(!inputs || inputs.length != 1) {
        group.logger.log("DELETE EVENT ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const eventId = inputs[0] != "" ? Number(inputs[0]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventId)) {
        group.logger.log("DELETE EVENT ERROR: Event ID must be a number.");
        group.logger.send();
        return false;
    }

    group.logger.log("DELETE EVENT: Successfully obtained log info");
    return deleteEvent(groupId, eventId);
}

// Loads the question data for the event in the group's log sheet
export async function loadQuestionData(groupId: number, eventId: number) {
    const group = groups[groupId];
    const event = group.events[eventId];

    const onComplete = (res: boolean) => {
        if(res) group.logger.log("LOAD QUESTION DATA: Load successful");
        if(!res) group.logger.log("LOAD QUESTION DATA: Load unsuccessful");

        group.logger.send();
        return res;
    }

    // Go through all the questions in the event's source and load them in the 
    // group's log sheet
    if(event.sourceType == SourceType.GoogleSheets) {
        group.logger.log(`LOAD QUESTION DATA: Loading question data for event ID ${eventId} from Google Sheets...`);
        return loadQuestionDataFromGoogleSheets(group, eventId).then(onComplete);
    } else if(event.sourceType == SourceType.GoogleForms) {
        group.logger.log(`LOAD QUESTION DATA: Loading question data for event ID ${eventId} from Google Forms...`);
        return loadQuestionDataFromGoogleForms(group, eventId).then(onComplete);
    }

    // If it doesn't match with any of the source types, return false
    group.logger.log("LOAD QUESTION DATA: Invalid source type");
    group.logger.send();
    return false;
}

export async function loadQuestionDataFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("LOAD QUESTION DATA: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        range: RANGE_LOAD_QUESTION_DATA_OP
    });

    const inputs = res1.data.values?.[0];
    const eventId = inputs[0] != "" ? Number(inputs[0]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventId) || eventId < -1 || eventId >= group.events.length) {
        group.logger.log(`LOAD QUESTION DATA ERROR: Event ID must be a number 
            between 0 and ${group.events.length - 1}.`);
        group.logger.send();
        return false;
    }

    group.logger.log("LOAD QUESTION DATA: Successfully obtained log info");
    return loadQuestionData(groupId, eventId);
}

// Updates question data for the event in the group
export async function updateQuestionData(groupId: number, eventId: number,
    matches: QuestionPropertyMatch[]) {
    const group = groups[groupId];
    const builder = new UpdateQuestionDataBuilder(group);
    builder.eventId = eventId;
    builder.questionToPropertyMatches = matches;
    
    group.logger.log("UPDATE QUESTION DATA: Performing operation...");
    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            group.logger.log("UPDATE QUESTION DATA: Operation successful");

            if(UPDATE_LOGS) {
                group.logger.log("UPDATE QUESTION DATA: Now updating logs...");
                group.logger.send();
                return updateLogsForGroup(group, false, true);
            }
        } 
        else group.logger.log("UPDATE QUESTION DATA: Operation unsuccessful");

        group.logger.send();
        return res;
    });
}

export async function updateQuestionDataFromLog(groupId: number) {
    const sheets = await getSheets();
    const group = groups[groupId];

    group.logger.log("UPDATE QUESTION DATA: Obtaining log information...");
    const res1 = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: group.logSheetUri,
        ranges: [
            RANGE_LOAD_QUESTION_DATA_OP,
            RANGE_UPDATE_QUESTION_DATA_OP
        ],
    });

    // Validate value ranges
    const inputs1 = res1.data.valueRanges[0].values[0];
    const inputs2 = res1.data.valueRanges[1].values;
    if(!inputs1) {
        group.logger.log("UPDATE QUESTION DATA ERROR: Not all required fields are set.");
        group.logger.send();
        return false;
    }

    // Retrieve input
    const eventId = inputs1 && inputs1[0] != "" ? Number(inputs1[0]) : -1;

    // Validate parsing numerical input
    if(Number.isNaN(eventId)) {
        group.logger.log("UPDATE QUESTION DATA ERROR: Event ID must be a number.");
        group.logger.send();
        return false;
    }

    // Retrieve input again (matches this time)
    const matches : QuestionPropertyMatch[] = [];
    inputs2.forEach((matchRow, index) => {
        if(matchRow.length != 4) {
            group.logger.log(`UPDATE QUESTION DATA ERROR: Row ${index} is malformed. Skipping...`);
            return;
        } 

        const questionId = `${matchRow[2]}`;
        const property = `${matchRow[3]}`;

        // Validate the property input
        if(isMemberProperty(property)) {
            matches.push({
                questionId: questionId,
                property: property
            });
        } else {
            group.logger.log(`UPDATE QUESTION DATA: ${property} is an invalid 
                Member Property. Skipping...`);
        }
    });

    group.logger.log("UPDATE QUESTION DATA: Successfully obtained log info");
    return updateQuestionData(groupId, eventId, matches);
}