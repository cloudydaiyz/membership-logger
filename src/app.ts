import { groupRouter } from "./group-controller.js";
import { initGroups } from "./group-manager.js";
import express from "express";

// Initialize the groups
initGroups();

// Set up the server
const app = express();
app.use('/groups', groupRouter);
app.listen(3000);