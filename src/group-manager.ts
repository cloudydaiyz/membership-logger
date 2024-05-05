// Provides the Model for interacting with Groups
import * as fs from "node:fs/promises";
import { Group, isMemberProperty } from "./group.js";
import { GroupSettings, GroupMap, QuestionPropertyMatch, SourceType } from "./group-interfaces.js";
import { GROUPS_PATH } from "./secrets.js";
import { RANGE_DELETE_EVENT_OP, RANGE_DELETE_EVENT_TYPE_OP, RANGE_UPDATE_EVENT_OP, RANGE_UPDATE_EVENT_TYPE_OP, RANGE_UPDATE_QUESTION_DATA_OP_1, RANGE_UPDATE_QUESTION_DATA_OP_2, loadQuestionDataFromGoogleForms, loadQuestionDataFromGoogleSheets, updateLogsForGroup } from "./log-publisher.js";
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
        refreshTasks.push(refreshGroup(parseInt(groupId)));

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

/* UPDATE EVENT TYPE OPERATION */
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
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        majorDimension: "COLUMNS",
        range: RANGE_UPDATE_EVENT_TYPE_OP
    });

    const inputs = res1.data.values[0];
    const typeId = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const eventType = inputs[1];
    const points = inputs[2] != "" ? parseInt(inputs[2]) : -1;

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

    const inputs = res1.data.values[0];
    const toRemove = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const toReplace = inputs[1] != "" ? parseInt(inputs[1]) : -1;

    group.logger.log("DELETE EVENT TYPE: Successfully obtained log info");
    return deleteEventType(groupId, toRemove, toReplace);
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
    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetUri,
        majorDimension: "COLUMNS",
        range: RANGE_UPDATE_EVENT_OP
    });

    const inputs = res1.data.values[0];
    const eventId = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const eventTitle = inputs[1];
    const eventDate = inputs[2];
    const source = inputs[3];
    const sourceType = inputs[4];
    const eventTypeId = inputs[5] != "" ? parseInt(inputs[5]) : -1;

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

    const inputs = res1.data.values[0];
    const eventId = inputs[0] != "" ? parseInt(inputs[0]) : -1;

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
        return loadQuestionDataFromGoogleSheets(group, eventId, event).then(onComplete);
    } else if(event.sourceType == SourceType.GoogleForms) {
        group.logger.log(`LOAD QUESTION DATA: Loading question data for event ID ${eventId} from Google Forms...`);
        return loadQuestionDataFromGoogleForms(group, eventId, event).then(onComplete);
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
        range: RANGE_UPDATE_QUESTION_DATA_OP_1
    });

    const inputs = res1.data.values[0];
    const eventID = inputs[0] != "" ? parseInt(inputs[0]) : -1;

    group.logger.log("LOAD QUESTION DATA: Successfully obtained log info");
    return loadQuestionData(groupId, eventID);
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
            RANGE_UPDATE_QUESTION_DATA_OP_1,
            RANGE_UPDATE_QUESTION_DATA_OP_2
        ],
    });

    const inputs1 = res1.data.valueRanges[0].values[0];
    const eventID = inputs1[0] != "" ? parseInt(inputs1[0]) : -1;

    const inputs2 = res1.data.valueRanges[1].values;
    const matches : QuestionPropertyMatch[] = [];
    inputs2.forEach(matchRow => {
        if(matchRow.length != 4) return;

        const questionId = `${matchRow[2]}`;
        const property = `${matchRow[3]}`;

        // Validate the property input
        if(isMemberProperty(property)) {
            matches.push({
                questionId: questionId,
                property: property
            });
        }
    });

    group.logger.log("UPDATE QUESTION DATA: Successfully obtained log info");
    return updateQuestionData(groupId, eventID, matches);
}