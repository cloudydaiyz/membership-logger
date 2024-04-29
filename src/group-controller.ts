import express from "express";
import { getAllGroups, getGroup, refreshAllGroups, refreshGroup, updateEventTypeFromLog } from "./group-manager.js";
import { getSheets } from "./google-client.js";
export const groupRouter = express.Router();

// get all groups
groupRouter.get('/', (req, res) => {
    getAllGroups().then(val => res.send(val));
});

// refresh all groups
groupRouter.post('/', (req, res) => {
    refreshAllGroups().then(val => res.send(val));
});

// get a specific group
groupRouter.get('/:id', (req, res) => {
    getGroup(parseInt(req.params.id)).then(val => res.send(val));
});

// refresh a specific group
groupRouter.post('/:id', (req, res) => {
    refreshGroup(parseInt(req.params.id)).then(val => res.send(val));
});

// perform update event type operation
groupRouter.post('/:id/updateEventType', (req, res) => {
    if(req.query.fromLog == "true") {
        updateEventTypeFromLog(parseInt(req.params.id)).then(val => res.send(val));
    }
});

// perform delete event type operation
groupRouter.post('/:id/deleteEventType', (req, res) => {
    if(req.query.fromLog == "true") {
        
    }
});

// perform update event operation
groupRouter.post('/:id/updateEvent', (req, res) => {
    if(req.query.fromLog == "true") {
        
    }
});

// perform delete event operation
groupRouter.post('/:id/deleteEvent', (req, res) => {
    if(req.query.fromLog == "true") {
        
    }
});

// perform update question data operation
groupRouter.post('/:id/updateQuestionData', (req, res) => {
    if(req.query.fromLog == "true") {
        
    }
});