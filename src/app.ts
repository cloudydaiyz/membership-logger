import { authorizeGoogle } from "./google-client.js";
import { groupRouter } from "./group-controller.js";
import { initGroups } from "./group-manager.js";
import express from "express";

import { fileURLToPath } from 'url'
import path from 'path'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Paths to config files
export const SERVICE_KEY_PATH = path.join(__dirname, '../config/service-key.json');
export const GROUPS_PATH = path.join(__dirname, '../config/groups.json');

// Environment variables
export const UPDATE_LOGS = process.env.MEMBERSHIP_LOGGER_UPDATE_LOGS == '1' ? true : false;
export const SERVER_PORT = process.env.MEMBERSHIP_LOGGER_SERVER_PORT != undefined ?
    Number(process.env.MEMBERSHIP_LOGGER_SERVER_PORT) : 3000;

// Set up and start the app
console.log("\x1b[1mSTARTING MEMBERSHIP LOGGER\x1b[0m");
authorizeGoogle()
    .then( _ => initGroups())
    .then( _ => {
        const app = express();
        app.use(express.json());
        app.use("/groups", groupRouter);
        console.log("Listening on port " + SERVER_PORT);
    })
    .catch(reason => {
        console.log("Unable to begin program");
        console.log("Reason: " + reason);
    });