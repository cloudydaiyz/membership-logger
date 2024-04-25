// Provides the Model for interacting with Groups
import * as fs from "node:fs/promises";
import { Group } from "./group.js";
import { GroupSettings, GroupMap, QuestionPropertyMatch } from "./group-interfaces.js";
import { GROUPS_PATH } from "./secrets.js";
import { updateLogsForGroup } from "./log-publisher.js";
import { DeleteEventBuilder, DeleteEventTypeBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder } from "./group-operations.js";

export const groups: GroupMap = {};

// Initializes the groups based on the settings
export async function initGroups() {
    // Obtain the settings for each group from the config file
    const raw_group_settings = await fs.readFile(GROUPS_PATH);
    const group_settings = JSON.parse(String(raw_group_settings)) as GroupSettings[];
    console.log(group_settings);
    
    // Create groups from each of the settings
    for(const settings of group_settings) {
        const group = new Group(settings);
        groups[settings.id] = group;
        await group.reset();
    }
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
        refreshLogsTasks.push(updateLogsForGroup(group));
    }
    
    await Promise.all(refreshTasks);
    await Promise.all(refreshLogsTasks);
}

// Refreshes the information for a group
export async function refreshGroup(groupID: number) {
    const group = groups[groupID];
    await group.reset();
    return await updateLogsForGroup(group);
}

// Creates or updates the event type for the group
export async function updateEventType(groupID: number, typeID: number, 
    typeName: string, points: number) {
    const group = groups[groupID];
    const builder = new UpdateEventTypeBuilder(group);
    builder.typeID = typeID;
    builder.typeName = typeName;
    builder.points = points;
    return builder.build();
}

// Deletes an event type for the group
export async function deleteEventType(groupID: number, typeIDtoRemove: number, 
    typeIDtoReplace: number) {
    const group = groups[groupID];
    const builder = new DeleteEventTypeBuilder(group);
    builder.typeIDtoRemove = typeIDtoRemove;
    builder.typeIDtoReplace = typeIDtoReplace;
    return builder.build();
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

    const task = builder.build().then(result => {
        // If the operation is successful, then move to part 2 and edit the
        // question to property matching
        if(result == true) {
            return loadQuestionData(groupID, eventID);
        }
    });
    return task;
}

// Deletes the event for the group
export async function deleteEvent(groupID: number, eventID: number) {
    const group = groups[groupID];
    const builder = new DeleteEventBuilder(group);
    builder.eventID = eventID;
    return builder.build()
        .then(res => { 
            if(res) loadQuestionData(groupID, eventID); 
            return res;
        });
}

// Loads the question data for the event in the group's log sheet
export async function loadQuestionData(groupID: number, eventID: number) {
    const group = groups[groupID];
    const event = group.events[eventID];

    // Go through all the questions in the event's source and load them in the 
    // group's log sheet
}

// Updates question data for the event in the group
export async function updateQuestionData(groupID: number, eventID: number,
    matches: QuestionPropertyMatch[]) {
    const group = groups[groupID];
    const builder = new UpdateQuestionDataBuilder(group);
    builder.eventID = eventID;
    builder.questionToPropertyMatches = matches;
    return builder.build();
}