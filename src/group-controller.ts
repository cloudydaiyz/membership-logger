import express from "express";
import { getAllGroups, getGroup, refreshAllGroups, refreshGroup } from "./group-manager.js";
export const groupRouter = express.Router();

// get all groups
// groupRouter.get('/', (req, res) => {
//     getAllGroups().then(val => res.send(val));
//     // getAllGroups().then(val => res.send(JSON.stringify(val, null, 4)));
// });

// refresh all groups
groupRouter.post('/', (req, res) => {
    refreshAllGroups().then(val => res.send(JSON.stringify(val, null, 4)));
});

// get a specific group
groupRouter.get('/:id', (req, res) => {
    getGroup(parseInt(req.params.id)).then(val => res.send(val));
});

// refresh a specific group
groupRouter.post('/:id', (req, res) => {
    refreshGroup(parseInt(req.params.id)).then(val => res.send(val));
});