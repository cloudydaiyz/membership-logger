// Testing area!
import { getQuestionData } from "./group-operations.js";
import { Group, SERVER_SIMS_KEY } from "./group.js"
import { GroupSettings, QuestionPropertyMatch } from "./interfaces.js";
import crypto from "crypto";

async function testing() {
    const settings: GroupSettings = {
        name: "ABCS",
        logSheetURI: "1HvzNt0xpLnyNu5ApX1wcYufMml2xcBo8Xm884X-uKkI",
        version: "1.0.0",
        simsIV: "",
        metadata: {}
    }
    let exampleGroup = new Group(0, settings);
    await exampleGroup.refresh(true);

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

    console.log("SIMS TESTING");
    const iv = crypto.randomBytes(16);
    // console.log(iv.toString());
    // console.log(Buffer.from(iv.toString()).toString());
    
    const data = getQuestionData(exampleMatching);
    console.log(data);

    const sims = exampleGroup.simsGenerator.generateSims(data, SERVER_SIMS_KEY, iv);
    console.log(sims);

    const receivedData = exampleGroup.simsGenerator.getQuestionDataFromSims(sims, SERVER_SIMS_KEY, iv);
    console.log(receivedData);

    console.log("OPERATIONS TESTING");
}

testing();