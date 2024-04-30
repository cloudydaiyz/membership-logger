import { groupRouter } from "./group-controller.js";
import { initGroups } from "./group-manager.js";
import express from "express";

// Initialize the groups, then set up the server
initGroups().then( _ => {
    const app = express();
    app.use(express.json());
    app.use('/groups', groupRouter);
    app.listen(3000);
});