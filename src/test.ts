// Testing area!
import { DeleteEventBuilder, DeleteEventTypeBuilder, UpdateEventBuilder, UpdateEventTypeBuilder, UpdateQuestionDataBuilder, getQuestionData } from "./group-operations.js";
import { Group, SERVER_SIMS_KEY, generateSims, getQuestionDataFromSims } from "./group.js"
import { GroupSettings, QuestionPropertyMatch } from "./group-interfaces.js";
import crypto from "crypto";
import { EXAMPLE_LOG_SHEET_ID } from "./secrets.js";
import { refreshLogs } from "./log-publisher.js";
import { initGroups, refreshAllGroups } from "./group-manager.js";

async function testing() {
    const settings: GroupSettings = {
        id: 0,
        name: "ABCS",
        logSheetURI: EXAMPLE_LOG_SHEET_ID,
        version: "1.0.0",
        simsIV: "",
        metadata: {}
    }
    let exampleGroup = new Group(0, settings);
    // await exampleGroup.refresh();
    
    await initGroups();
    await refreshAllGroups();

    // simsTest();
    // await updateEventOperationTest(exampleGroup);
    // await updateEventTypeTest(exampleGroup);
    // await deleteEventTypeTest(exampleGroup);
    // await deleteEventTest(exampleGroup);
    // await updateQuestionDataTest(exampleGroup);
}

function simsTest() {
    console.log("SIMS TEST");
    // Generate a random buffer
    // const randomBuffer = crypto.randomBytes(16);

    // Convert the buffer to a Base64 string
    // const base64String = randomBuffer.toString('base64');
    // console.log("Base64 String:", base64String);

    // Convert the Base64 string back to a buffer
    // const decodedBuffer = Buffer.from(base64String, 'base64');
    // console.log("Decoded Buffer:", decodedBuffer);

    // Verify if the decoded buffer matches the original random buffer
    // console.log("Buffers match:", randomBuffer.equals(decodedBuffer));

    let iv = crypto.randomBytes(16);
    // console.log(iv.toString('base64'));
    // let b64string = iv.toString('base64');
    iv = Buffer.from(iv.toString('base64'), 'base64');
    // console.log(iv.toString('base64'));

    const exampleMatching: QuestionPropertyMatch[] = [
        {
            "question": "What is your first name?",
            "questionId": "0",
            "property": "First Name"
        },
        {
            "question": "What is your last name?",
            "questionId": "1",
            "property": "Last Name"
        }
    ];

    const data = getQuestionData(exampleMatching);
    console.log(data);

    const sims = generateSims(data, SERVER_SIMS_KEY, iv);
    console.log(sims);

    const receivedData = getQuestionDataFromSims(sims, SERVER_SIMS_KEY, iv);
    console.log(receivedData);
}

async function updateEventOperationTest(group: Group) {
    console.log("OPERATIONS TEST");

    const builder = new UpdateEventBuilder(group);
    const keys = Object.getOwnPropertyNames(builder);
    builder.eventID = -1;
    builder.eventTitle = "Hello world";
    builder.rawEventDate = "2/2/2024";
    builder.rawEventType = "Socials";
    builder.source = "1gF6MY54dj9Xm4CfVQR_18oRENUsFSh0Tolrm4sa4Z1w";
    builder.sourceType = "GoogleSheets";
    builder.questionToPropertyMatches = [
        {
            question: "Hey",
            questionId: '0',
            property: "First Name"
        }
    ];

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function updateEventTypeTest(group: Group) {
    console.log("UPDATE EVENT TYPE OPERATION TEST");

    const builder = new UpdateEventTypeBuilder(group);
    builder.typeName = "Misc";
    builder.typeID = -1;
    builder.points = 75;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function deleteEventTypeTest(group: Group) {
    console.log("DELETE EVENT TYPE OPERATION TEST");

    const builder = new DeleteEventTypeBuilder(group);
    builder.typeIDtoRemove = 0;
    builder.typeIDtoReplace = 1;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function deleteEventTest(group: Group) {
    console.log("DELETE EVENT OPERATION TEST");

    const builder = new DeleteEventBuilder(group);
    builder.eventID = 0;

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

async function updateQuestionDataTest(group: Group) {
    console.log("UPDATE QUESTION DATA OPERATION TEST");

    const builder = new UpdateQuestionDataBuilder(group);

    console.log("GROUP BEFORE OPERATION:");
    console.log(group);
    const result = await builder.build();
    console.log("GROUP AFTER OPERATION:");
    console.log(group);
    console.log("OPERATION RESULT: " + result);
}

testing();