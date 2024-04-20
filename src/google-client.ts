import * as fs from "node:fs/promises";
import path from "path";
import process from "process";
import { google, sheets_v4, forms_v1 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { SERVICE_KEY_PATH } from "./secrets.js";

// If modifying these scopes, delete token.json.
const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly"
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.

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

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function listMajors(auth) {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Class Data!A2:E',
    });
    
    const rows = res.data.values;
    if (!rows || rows.length === 0) {
        console.log('No data found.');
        return;
    }
    console.log('Name, Major:');
    rows.forEach((row) => {
        // Print columns A and E, which correspond to indices 0 and 4.
        console.log(`${row[0]}, ${row[1]}`);
    });
}

authorize();