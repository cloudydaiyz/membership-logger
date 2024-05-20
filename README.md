<p align="center">
<img width="200" alt="Screen Shot 2023-03-22 at 11 59 37 PM" src="https://github.com/cloudydaiyz/membership-logger/blob/main/assets/logo.png" />
</p>

# membership-logger
![Static Badge](https://img.shields.io/badge/version-1.0-blue)

Based on: https://github.com/cloudydaiyz/org-console

The **membership-logger** project is an application that handles updating membership logs that are hosted on Google Sheets.

If you have a membership log that's controlled by this application, and you want to learn how to use it, view the Quickstart [here](https://docs.google.com/document/d/1T7WgC3a_U8O8gkZtOsSLJQO09xCeN2Sl6jsQLXmsX1k/edit?usp=sharing).

If you want to work on this application, you can find the Developer Guide [here](https://docs.google.com/document/d/1cdhejyH3h7AaaY_Ung5Hr_P9vsVRTkXeEOK_5aoxjD0/edit?usp=sharing).

## To Run Locally
`npm build` - Compiles files into a folder named `dst`

`npm run` - Recompiles and runs the application (found in `src/app.ts`)

`npm test` - Recompiles and runs the test code (found in `src/test.ts`)

`npm quick-test` - Recompiles and runs any quick test code (found in `src/quick-test.ts`)

## To Run as a Container
1. Run `docker build -t membership-logger .` to build a container titled `membership-logger` for this application.
2. Run `docker run -d -p 3000:3000 membership-logger` to run the container locally on port 3000.

## To Debug
The file contained in `.vscode/launch.json` provides the functionality for this app to be debugged in Visual Studio Code. If you want to debug this app:
1. Run `tsc` to rebuild the up-to-date files
2. Go to the Run and Debug tab in Visual Studio Code
3. Either run `Debug app.ts` or `Debug test.ts`.
