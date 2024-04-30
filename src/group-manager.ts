// Provides the Model for interacting with Groups
import * as fs from "node:fs/promises";
import { Group, isMemberProperty } from "./group.js";
import { GroupSettings, GroupMap, QuestionPropertyMatch, SourceType } from "./group-interfaces.js";
import { GROUPS_PATH } from "./secrets.js";
import { RANGE_DELETE_EVENT_OP, RANGE_DELETE_EVENT_TYPE_OP, RANGE_UPDATE_EVENT_OP, RANGE_UPDATE_EVENT_TYPE_OP, RANGE_UPDATE_QUESTION_DATA_OP_1, RANGE_UPDATE_QUESTION_DATA_OP_2, loadQuestionDataFromGoogleForms, loadQuestionDataFromGoogleSheets, updateLogsForGroup } from "./log-publisher.js";
import { DeleteEventBuilder, DeleteEventTypeBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder } from "./group-operations.js";
import { getSheets } from "./google-client.js";

export const groups: GroupMap = {};

const UPDATE_LOGS = true; // if true, updates the info on membership logs for each operation

// Initializes the groups based on the settings
export async function initGroups(groupList?: Group[], groupListAppend?: boolean) {
    if(groupList) {
        for(const group of groupList) {
            groups[group.settings.id] = group;
            await group.reset();
        }

        // If we're not appending the list of groups, but replacing, stop here
        if(groupListAppend == false) return;
    }

    // Obtain the settings for each group from the config file
    const raw_group_settings = await fs.readFile(GROUPS_PATH);
    const group_settings = JSON.parse(String(raw_group_settings)) as GroupSettings[];
    console.log(group_settings);

    // Keep track of the tasks from creating each group
    const createGroupTasks : Promise<boolean>[] = []
    
    // Create groups from each of the settings
    for(const settings of group_settings) {
        const group = new Group(settings);
        groups[settings.id] = group;

        createGroupTasks.push(group.reset().then(res => {
            if(res && UPDATE_LOGS) {
                return updateLogsForGroup(group, true, true);
            }
            return res;
        }));
    }

    return createGroupTasks;
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

    for(const groupID in groups) {
        const group = groups[groupID];
        refreshTasks.push(group.reset());

        if(UPDATE_LOGS) {
            refreshLogsTasks.push(updateLogsForGroup(group, true, true));
        }
    }
    
    await Promise.all(refreshTasks);
    await Promise.all(refreshLogsTasks);
}

// Refreshes the information for a group
export async function refreshGroup(groupID: number) {
    const group = groups[groupID];

    return group.reset().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, true, true);
        } 
        return res;
    });
}

/* UPDATE EVENT TYPE OPERATION */
// Creates or updates the event type for the group
export async function updateEventType(groupID: number, typeID: number, 
    typeName: string, points: number) {
    const group = groups[groupID];
    const builder = new UpdateEventTypeBuilder(group);
    builder.typeID = typeID;
    builder.typeName = typeName;
    builder.points = points;

    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, true, true);
        }
        return res;
    });
}

// Updates the event type using information from the group's log
export async function updateEventTypeFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetURI,
        majorDimension: "COLUMNS",
        range: RANGE_UPDATE_EVENT_TYPE_OP
    });

    const inputs = res1.data.values[0];
    const typeID = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const eventType = inputs[1];
    const points = inputs[2] != "" ? parseInt(inputs[2]) : -1;

    console.log(typeID, eventType, points);
    return updateEventType(groupID, typeID, eventType, points);
}

// Deletes an event type for the group
export async function deleteEventType(groupID: number, typeIDtoRemove: number, 
    typeIDtoReplace: number) {
    const group = groups[groupID];
    const builder = new DeleteEventTypeBuilder(group);
    builder.typeIDtoRemove = typeIDtoRemove;
    builder.typeIDtoReplace = typeIDtoReplace;

    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, true, true);
        }
        return res;
    });
}

export async function deleteEventTypeFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetURI,
        majorDimension: "COLUMNS",
        range: RANGE_DELETE_EVENT_TYPE_OP
    });

    const inputs = res1.data.values[0];
    const toRemove = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const toReplace = inputs[1] != "" ? parseInt(inputs[1]) : -1;

    console.log(toRemove, toReplace);
    return deleteEventType(groupID, toRemove, toReplace);
}

// Creates or updates an event for the group
export async function updateEvent(groupID: number, eventID: number, 
    eventTitle: string, rawEventDate: string, source: string, sourceType: string, 
    rawEventType: string) {
    const group = groups[groupID];
    const builder = new UpdateEventBuilder(group);
    builder.eventID = eventID;
    builder.eventTitle = eventTitle;
    builder.rawEventDate = rawEventDate;
    builder.source = source;
    builder.sourceType = sourceType;
    builder.rawEventType = rawEventType;

    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, false, true);
        }
        return res;
    });
}

export async function updateEventFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetURI,
        majorDimension: "COLUMNS",
        range: RANGE_UPDATE_EVENT_OP
    });

    const inputs = res1.data.values[0];
    const eventID = inputs[0] != "" ? parseInt(inputs[0]) : -1;
    const eventTitle = inputs[1];
    const eventDate = inputs[2];
    const source = inputs[3];
    const sourceType = inputs[4];
    const eventType = inputs[5];

    console.log(eventID, eventTitle, eventDate, source, sourceType, eventType);
    return updateEvent(groupID, eventID, eventTitle, eventDate, source, sourceType, eventType);
}

// Deletes the event for the group
export async function deleteEvent(groupID: number, eventID: number) {
    const group = groups[groupID];
    const builder = new DeleteEventBuilder(group);
    builder.eventID = eventID;

    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, false, true);
        }
        return res;
    });
}

export async function deleteEventFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetURI,
        range: RANGE_DELETE_EVENT_OP
    });

    const inputs = res1.data.values[0];
    const eventID = inputs[0] != "" ? parseInt(inputs[0]) : -1;

    console.log(eventID);
    return deleteEvent(groupID, eventID);
}

// Loads the question data for the event in the group's log sheet
export async function loadQuestionData(groupID: number, eventID: number) {
    const group = groups[groupID];
    const event = group.events[eventID];

    // Go through all the questions in the event's source and load them in the 
    // group's log sheet
    if(event.sourceType == SourceType.GoogleSheets) {
        return loadQuestionDataFromGoogleSheets(group, eventID, event);
    } else if(event.sourceType == SourceType.GoogleForms) {
        return loadQuestionDataFromGoogleForms(group, eventID, event);
    }

    // If it doesn't match with any of the source types, return false
    return false;
}

export async function loadQuestionDataFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.get({
        spreadsheetId: group.logSheetURI,
        range: RANGE_UPDATE_QUESTION_DATA_OP_1
    });

    const inputs = res1.data.values[0];
    const eventID = inputs[0] != "" ? parseInt(inputs[0]) : -1;

    console.log(eventID);
    return loadQuestionData(groupID, eventID);
}

// Updates question data for the event in the group
export async function updateQuestionData(groupID: number, eventID: number,
    matches: QuestionPropertyMatch[]) {
    const group = groups[groupID];
    const builder = new UpdateQuestionDataBuilder(group);
    builder.eventID = eventID;
    builder.questionToPropertyMatches = matches;

    return builder.build().then(res => {
        if(res && UPDATE_LOGS) {
            return updateLogsForGroup(group, false, true);
        }
        return res;
    });
}

export async function updateQuestionDataFromLog(groupID: number) {
    const sheets = await getSheets();
    const group = groups[groupID];

    const res1 = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: group.logSheetURI,
        ranges: [
            RANGE_UPDATE_QUESTION_DATA_OP_1,
            RANGE_UPDATE_QUESTION_DATA_OP_2
        ],
    });

    const inputs1 = res1.data.valueRanges[0].values[0];
    const eventID = inputs1[0] != "" ? parseInt(inputs1[0]) : -1;

    const inputs2 = res1.data.valueRanges[1].values;
    const matchings : QuestionPropertyMatch[] = [];
    inputs2.forEach(matchRow => {
        if(matchRow.length != 4) return;

        const question = `${matchRow[0]}`;
        const questionId = `${matchRow[2]}`;
        const property = `${matchRow[3]}`;

        // Validate the property input
        if(isMemberProperty(property)) {
            matchings.push({
                question: question,
                questionId: questionId,
                property: property
            });
        }
    });

    console.log(eventID);
    return updateQuestionData(groupID, eventID, matchings);
}