// Testing area!
import { DeleteEventBuilder, DeleteEventTypeBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder, getQuestionData } from "./group-operations.js";
import { Group, generateSims, getQuestionDataFromSims } from "./group.js"
import { Event, GroupSettings, QuestionPropertyMatch, SourceType } from "./group-interfaces.js";
import { EXAMPLE_LOG_SHEET_ID, SERVER_SIMS_KEY } from "./secrets.js";
import { loadQuestionDataFromGoogleForms, loadQuestionDataFromGoogleSheets, updateLogsForGroup } from "./log-publisher.js";
import { deleteEventFromLog, deleteEventTypeFromLog, getGroup, initGroups, loadQuestionData, loadQuestionDataFromLog, refreshAllGroups, updateEventFromLog, updateEventTypeFromLog, updateQuestionDataFromLog } from "./group-manager.js";
import dayjs from "dayjs";
import crypto from "crypto";

async function testing() {
    
    // simsTest();

    // await initGroups();
    // await refreshAllGroups();

    const exampleGroup = await groupTest(false);

    // await initTestGroups([exampleGroup]);
    // await getMemberInfoFromSheetsTest(exampleGroup);
    // await getMemberInfoFromFormsTest(exampleGroup);
    // await updateEventTest(exampleGroup);
    // await updateEventTypeTest(exampleGroup);
    // await deleteEventTypeTest(exampleGroup);
    // await deleteEventTest(exampleGroup);
    // await updateQuestionDataTest(exampleGroup);
    // await loadQuestionDataFromGoogleSheetsTest(exampleGroup);
    // await loadQuestionDataFromGoogleFormsTest(exampleGroup);
    // await updateEventTypeFromLogTest();
    // await deleteEventTypeFromLogTest();
    // await updateEventFromLogTest();
    // await deleteEventFromLogTest();
    // await loadQuestionDataFromLogsTest();
    // await updateQuestionDataFromLogsTest();
    groupLoggerTest(exampleGroup);
}

// Test creating and using a SIMS string 
function simsTest() {
    console.log("SIMS TEST");

    // Generate a random buffer
    const iv = crypto.randomBytes(16);

    // Convert the buffer to a Base64 string
    const base64String = iv.toString('base64');
    console.log("Base64 String:", base64String);

    // Convert the Base64 string back to a buffer
    const decodedBuffer = Buffer.from(base64String, 'base64');
    console.log("Decoded Buffer:", decodedBuffer);

    // Verify if the decoded buffer matches the original random buffer
    console.log("Buffers match:", iv.equals(decodedBuffer));

    const exampleMatches: QuestionPropertyMatch[] = [
        {
            "questionId": "0",
            "property": "First Name"
        },
        {
            "questionId": "1",
            "property": "Last Name"
        }
    ];

    // Convert sample question property matches to a QuestionData object
    const data = getQuestionData(exampleMatches);
    console.log(data);

    // Generate a SIMS string using the generated question data
    const sims = generateSims(data, SERVER_SIMS_KEY, iv);
    console.log(sims);

    // Retrieve question data from the SIMS string
    const receivedData = getQuestionDataFromSims(sims, SERVER_SIMS_KEY, iv);
    console.log(receivedData);
}

// Test refreshing a single group
async function groupTest(refresh: boolean) {
    const settings: GroupSettings = {
        id: 0,
        name: "ABCS",
        logSheetUri: EXAMPLE_LOG_SHEET_ID,
        version: "1.0.0",
        simsIV: "0CcixtBxH1VQ1z4DtKQsdw==",
        outputCapacity: 200,
        outputRetentionPeriod: 7
    }
    
    let exampleGroup = new Group(settings);
    await exampleGroup.reset();
    if(refresh) updateLogsForGroup(exampleGroup, true, true);

    return exampleGroup;
}

async function initTestGroups(groups: Group[]) {
    return initGroups(groups, false);
}

// Test obtaining member information from Google Sheets
async function getMemberInfoFromSheetsTest(group: Group) {
    const exampleMatches: QuestionPropertyMatch[] = [
        {
            "questionId": "1",
            "property": "First Name"
        },
        {
            "questionId": "2",
            "property": "Last Name"
        },
        {
            "questionId": "3",
            "property": "UT EID"
        },
        {
            "questionId": "4",
            "property": "Email"
        },
        {
            "questionId": "5",
            "property": "Phone Number"
        }
    ];
    const data = getQuestionData(exampleMatches);
    const sims = group.getSims(data);
    console.log(data);
    console.log(sims);

    // Test adding an event 
    const testEvent: Event = {
        eventName: "General Meeting #16",
        semester: "Fall",
        eventDate: dayjs(),
        eventType: group.eventTypes[0],
        source: "1gF6MY54dj9Xm4CfVQR_18oRENUsFSh0Tolrm4sa4Z1w",
        sourceType: SourceType.GoogleSheets,
        attendees: {},
        sims: sims,
        questionData: data
    }
    await group.addEvent(testEvent);
    console.log(group);
}

// Test obtaining member information from Google Forms
async function getMemberInfoFromFormsTest(group: Group) {
    const exampleMatches: QuestionPropertyMatch[] = [
        {
            "questionId": "65809e76",
            "property": "First Name"
        },
        {
            "questionId": "1da58d25",
            "property": "Last Name"
        },
        {
            "questionId": "6cf3dd44",
            "property": "UT EID"
        },
        {
            "questionId": "540150ef",
            "property": "Email"
        },
        {
            "questionId": "3becb400",
            "property": "Phone Number"
        }
    ];
    const data = getQuestionData(exampleMatches);
    const sims = group.getSims(data);
    console.log(data);
    console.log(sims);

    // Test adding an event 
    const testEvent: Event = {
        eventName: "General Meeting #17",
        semester: "Fall",
        eventDate: dayjs(),
        eventType: group.eventTypes[0],
        source: "1WKRaI-KhUSaKboNi97VdWBneF9J9KWBQ-K8fKffEJMc",
        sourceType: SourceType.GoogleForms,
        attendees: {},
        sims: sims,
        questionData: data
    }
    await group.addEvent(testEvent);
    console.log(group);
}

// Test the updateEvent group operation
async function updateEventTest(group: Group) {
    console.log("OPERATIONS TEST");

    const builder = new UpdateEventBuilder(group);
    builder.eventId = -1;
    builder.eventTitle = "Hello world";
    builder.rawEventDate = "2/2/2024";
    builder.eventTypeId = 0;
    builder.source = "1gF6MY54dj9Xm4CfVQR_18oRENUsFSh0Tolrm4sa4Z1w";
    builder.sourceType = "GoogleSheets";

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function updateEventFromLogTest() {
    const groupID = 0;
    const group = await getGroup(groupID);

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await updateEventFromLog(groupID);
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

// Test the updateEventType group operation
async function updateEventTypeTest(group: Group) {
    console.log("UPDATE EVENT TYPE OPERATION TEST");

    const builder = new UpdateEventTypeBuilder(group);
    builder.typeName = "Misc";
    builder.typeId = -1;
    builder.points = 75;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function updateEventTypeFromLogTest() {
    const groupID = 0;
    const group = await getGroup(groupID);

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await updateEventTypeFromLog(groupID);
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

// Test the deleteEventType operation
async function deleteEventTypeTest(group: Group) {
    console.log("DELETE EVENT TYPE OPERATION TEST");

    const builder = new DeleteEventTypeBuilder(group);
    builder.typeIdtoRemove = 0;
    builder.typeIdtoReplace = 1;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function deleteEventTypeFromLogTest() {
    const groupID = 0;
    const group = await getGroup(groupID);

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await deleteEventTypeFromLog(groupID);
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

// Test the deleteEvent group operation
async function deleteEventTest(group: Group) {
    console.log("DELETE EVENT OPERATION TEST");

    const builder = new DeleteEventBuilder(group);
    builder.eventId = 0;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function deleteEventFromLogTest() {
    const groupID = 0;
    const group = await getGroup(groupID);

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await deleteEventFromLog(groupID);
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

// Test the updateQuestionData group operation
async function updateQuestionDataTest(group: Group) {
    const exampleMatches1: QuestionPropertyMatch[] = [
        {
            "questionId": "1",
            "property": "First Name"
        },
        {
            "questionId": "2",
            "property": "Last Name"
        },
        {
            "questionId": "4",
            "property": "Email"
        },
        {
            "questionId": "5",
            "property": "Phone Number"
        }
    ];

    const exampleMatches2: QuestionPropertyMatch[] = [
        {
            "questionId": "1",
            "property": "First Name"
        },
        {
            "questionId": "2",
            "property": "Last Name"
        },
        {
            "questionId": "3",
            "property": "UT EID"
        },
        {
            "questionId": "5",
            "property": "Phone Number"
        }
    ];

    console.log("UPDATE QUESTION DATA OPERATION TEST");

    const builder = new UpdateQuestionDataBuilder(group);
    builder.eventId = 0;
    builder.questionToPropertyMatches = exampleMatches1;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function loadQuestionDataFromGoogleSheetsTest(group: Group) {
    console.log(group.events[0].sourceType);
    console.log("LOADING QUESTION DATA FROM SHEETS");
    const result = await loadQuestionDataFromGoogleSheets(group, 0);
    console.log("OPERATION RESULT: " + result);
}

async function loadQuestionDataFromGoogleFormsTest(group: Group) {
    console.log(group.events[0].sourceType);
    console.log("LOADING QUESTION DATA FROM FORMS");
    const result = await loadQuestionDataFromGoogleForms(group, 0);
    console.log("OPERATION RESULT: " + result);
}

async function loadQuestionDataFromLogsTest() {
    const groupID = 0;

    console.log("LOADING QUESTION DATA FROM LOGS");
    const result = await loadQuestionDataFromLog(groupID);
    console.log("OPERATION RESULT: " + result);
}

async function updateQuestionDataFromLogsTest() {
    const groupID = 0;
    const group = await getGroup(groupID);

    console.log("UPDATING QUESTION DATA FROM LOGS");
    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await updateQuestionDataFromLog(groupID);
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function groupLoggerTest(group: Group) {
    group.logger.log("GROUP LOGGER TEST");
    group.logger.log("Hello");
    group.logger.log("World");
    group.logger.log("Bonk");
    group.logger.log("Test");
    group.logger.log("Hello");
    await group.logger.clear(5);

    group.logger.log("Hello");
    group.logger.log("World");
    group.logger.log("Bonk");
    group.logger.log("Test");
    await group.logger.send();

    group.logger.capacity = 3;
    await group.logger.maintainCapacity();

    group.logger.retainPeriod = 0;
    await group.logger.deleteOldMessages();
}

testing();