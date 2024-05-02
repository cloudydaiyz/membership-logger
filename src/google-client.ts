import * as fs from "node:fs/promises";
import path from "path";
import process from "process";
import { google, sheets_v4, forms_v1 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { SERVICE_KEY_PATH } from "./secrets.js";

const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly"
];

let auth: GoogleAuth;
let sheets: sheets_v4.Sheets;
let forms: forms_v1.Forms;

/**
 * Load or request or authorization to call APIs.
 */
export async function authorize() {
    if(auth === undefined) {
        const raw_credentials = await fs.readFile(SERVICE_KEY_PATH);
        const credentials = JSON.parse(String(raw_credentials));
        auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: SCOPES
        });
    }
}

// Obtains the Google Sheets client
export async function getSheets(): Promise<sheets_v4.Sheets> {
    await authorize();
    if(sheets === undefined) {
        sheets = google.sheets({version: 'v4', auth});
    }
    return sheets;
}

// Obtains the Google Forms client
export async function getForms(): Promise<forms_v1.Forms> {
    await authorize();
    if(forms === undefined) {
        forms = google.forms({version: 'v1', auth});
    }
    return forms;
}

authorize();