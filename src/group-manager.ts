// Provides the Model for interacting with Groups
import * as fs from "node:fs/promises";
import { Group } from "./group.js";
import { GroupSettings, GroupMap } from "./group-interfaces.js";
import { GROUPS_PATH } from "./secrets.js";
import { refreshLogs } from "./log-publisher.js";

export const groups: GroupMap = {};

export async function initGroups() {
    // Obtain the settings for each group from the config file
    const raw_group_settings = await fs.readFile(GROUPS_PATH);
    const group_settings = JSON.parse(String(raw_group_settings)) as GroupSettings[];
    console.log(group_settings);
    
    // Create groups from each of the settings
    for(const settings of group_settings) {
        const group = new Group(settings.id, settings);
        groups[group.id] = group;
        await group.reset();
        console.log(group);
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
        refreshLogsTasks.push(refreshLogs(group));
    }
    console.log(refreshTasks);
    await Promise.all(refreshTasks);
    await Promise.all(refreshLogsTasks);
}

// Refreshes the information for a group
export async function refreshGroup(groupID: number) {
    const group = groups[groupID];
    await group.reset();
    return await refreshLogs(group);
}