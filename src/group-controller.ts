import express from "express";
import { deleteEvent, deleteEventFromLog, deleteEventType, deleteEventTypeFromLog, getAllGroups, getGroup, loadQuestionData, loadQuestionDataFromLog as loadQuestionDataFromLog, refreshAllGroups, refreshGroup, updateEvent, updateEventFromLog, updateEventType, updateEventTypeFromLog, updateQuestionData, updateQuestionDataFromLog } from "./group-manager.js";
import { getSheets } from "./google-client.js";
import { QuestionPropertyMatch } from "./group-interfaces.js";
import { isMemberProperty } from "./group.js";

export const groupRouter = express.Router();

// Get all groups
groupRouter.get('/', (req, res) => {
    getAllGroups().then(val => res.send(val));
});

// Refresh all groups
groupRouter.post('/', (req, res) => {
    refreshAllGroups().then(val => res.send(val));
});

// Get a specific group
groupRouter.get('/:id', (req, res) => {
    getGroup(parseInt(req.params.id)).then(val => res.send(val));
});

// Refresh a specific group
groupRouter.post('/:id', (req, res) => {
    refreshGroup(parseInt(req.params.id)).then(val => res.send(val));
});

// Perform update event type operation
groupRouter.post('/:id/updateEventType', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        updateEventTypeFromLog(groupId).then(val => res.send(val));
        return;
    }

    // Account for optional parameters
    if(typeof req.body.typeId == "undefined") req.body.typeId = -1;

    // Validate request parameters
    if(typeof req.body.typeId != "number") { res.send(false); return; }
    if(typeof req.body.typeName != "string") { res.send(false); return; }
    if(typeof req.body.points != "number") { res.send(false); return; }

    updateEventType(groupId, req.body.typeId, req.body.typeName, req.body.points)
        .then(val => res.send(val));
});

// Perform delete event type operation
groupRouter.post('/:id/deleteEventType', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        deleteEventTypeFromLog(groupId).then(val => res.send(val));
        return;
    }

    // Validate request parameters
    if(typeof req.body.typeIdToRemove != "number") { res.send(false); return; }
    if(typeof req.body.typeIdToReplace != "number") { res.send(false); return; }

    deleteEventType(groupId, req.body.typeIdToRemove, req.body.typeIdToReplace)
        .then(val => res.send(val));
});

// Perform update event operation
groupRouter.post('/:id/updateEvent', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        updateEventFromLog(groupId).then(val => res.send(val));
        return;
    }
    console.log(req.body);

    // Account for optional parameters
    if(typeof req.body.eventId == "undefined") req.body.eventId = -1;

    // Validate request parameters
    if(typeof req.body.eventId != "number") { res.send(false); return; }
    if(typeof req.body.eventTitle != "string") { res.send(false); return; }
    if(typeof req.body.eventDate != "string") { res.send(false); return; }
    if(typeof req.body.source != "string") { res.send(false); return; }
    if(typeof req.body.sourceType != "string") { res.send(false); return; }
    if(typeof req.body.eventType != "string") { res.send(false); return; }

    updateEvent(groupId, req.body.eventId, req.body.eventTitle, req.body.eventDate,
        req.body.source, req.body.sourceType, req.body.eventType)
        .then(val => res.send(val));
});

// Perform delete event operation
groupRouter.post('/:id/deleteEvent', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        deleteEventFromLog(groupId).then(val => res.send(val));
        return;
    }

    // Validate request parameters
    if(typeof req.body.eventId != "number") { res.send(false); return; }

    deleteEvent(groupId, req.body.eventId).then(val => res.send(val));
});

// Perform update question data operation
groupRouter.post('/:id/loadQuestionData', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        loadQuestionDataFromLog(groupId).then(val => res.send(val));
        return;
    }

    // Validate request parameters
    if(typeof req.body.eventId != "number") { res.send(false); return; }

    loadQuestionData(groupId, req.body.eventId).then(val => res.send(val));
});

// Perform update question data operation
groupRouter.post('/:id/updateQuestionData', (req, res) => {
    const groupId = parseInt(req.params.id);
    if(req.query.fromLog == "true") {
        updateQuestionDataFromLog(groupId).then(val => res.send(val));
        return;
    }

    // Validate request parameters
    if(typeof req.body.eventId != "number") { res.send(false); return; }
    if(typeof req.body.matchings != "object" || !Array.isArray(req.body.matchings)) { res.send(false); return; }

    const matchings : QuestionPropertyMatch[] = [];
    for(const match of req.body.matchings) {
        if(typeof match != "object") { res.send(false); return; }
        if(typeof match.question != "string") { res.send(false); return; }
        if(typeof match.questionId != "string") { res.send(false); return; }
        if(typeof match.property != "string" || !isMemberProperty(match.property)) { res.send(false); return; }

        matchings.push({
            question: match.question,
            questionId: match.questionId,
            property: match.property
        });
    }

    updateQuestionData(groupId, req.body.eventId, matchings).then(val => res.send(val));
});