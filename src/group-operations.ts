// All operations that can be performed on a group are defined as builders in this file
import { Group, getSemesterFromDate } from "./group.js";
import { QuestionPropertyMatch, Event, EventType, SourceType, QuestionData, MemberProperty } from "./group-interfaces.js";
import crypto from "crypto";
import dayjs from "dayjs";
import { getForms, getSheets } from "./google-client.js";

// Updates an event's type
function updateTypeForEvent(event: Event, type: EventType) {
    for(const eid in event.attendees) {
        const member = event.attendees[eid];

        // Update this member's membership points
        const semester = getSemesterFromDate(event.eventDate);
        if(semester == "Fall") {
            member.fallPoints -= event.eventType.points;
            member.fallPoints += type.points;
        } 
        if(semester == "Spring") {
            member.springPoints -= event.eventType.points;
            member.springPoints += type.points;
        } 
        member.totalPoints -= event.eventType.points; // remove points from old event type
        member.totalPoints += type.points;            // add points from new event type
    }

    // Update the event's type
    event.eventType = type;
} 

// Creates a new QuestionData object from a list of objects containing
// mappings between questions and member properties
export function getQuestionData(matches: QuestionPropertyMatch[]) {
    const data: QuestionData = {
        questionIds: [],
        questionIdToPropertyMap: {}
    }

    // NOTE: If multiple questions map to the same property, only the last
    // question in the list will be used
    matches.forEach((match) => {
        if(data.questionIds.findIndex(id => id == match.questionId) == -1) {
            data.questionIds.push(match.questionId);
        }
        data.questionIdToPropertyMap[match.questionId] = match.property;
    });

    return data;
};

// Parent class for builders of all possible operations on a group
export class OperationBuilder {
    // Default fields for a builder, these get initialized by all constructors
    hash: string;
    group: Group;

    // Assigns a random hash and a group to the builder
    constructor(group: Group) {
        this.hash = crypto.randomBytes(10).toString("hex");
        this.group = group;
    }

    // Checks whether all fields in a builder are set
    areAllFieldsSet(): boolean {
        const fieldsUnset = Object.keys(this)
            .filter(key => this[key as keyof this] === undefined);

        return fieldsUnset.length === 0;
    }

    // Validates the input for the builder before performing an operation
    validateInput(): boolean {
        return false;
    }
    
    // Performs the update to the group associated with this builder
	async performOperation(): Promise<boolean> {
        return this.areAllFieldsSet();
    }

    // Performs an operation on a group if all the fields are set and all
    // input is valid
    async build() {
        return this.areAllFieldsSet() && this.validateInput() 
            && await this.performOperation();
    }
}

// Operation 1: UPDATE EVENT TYPE (updateEventType)
export class UpdateEventTypeBuilder extends OperationBuilder {
    typeId?: number = undefined;
    typeName?: string = undefined;
    points?: number = undefined;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        // Check if each of the inputs to the builder are valid
        if(this.typeId != -1 && (this.typeId < 0 
            || this.typeId >= this.group.eventTypes.length)) return false;
        if(this.points < 0) return false;

        // If it passed all the checks, then return true
        return true;
    }

    async performOperation() {
        let newType: EventType = {
            id: this.group.eventTypes.length,
            name: this.typeName,
            points: this.points
        };

        // Update the group with the new event type
        if(this.typeId == -1) {
            this.group.eventTypes.push(newType);
        } else {
            newType.id = this.typeId;

            // The type already exists -- update information for events with this type
            this.group.events.forEach(event => {
                updateTypeForEvent(event, newType);
            });

            // Replace the existing event type with this new one
            this.group.eventTypes[this.typeId] = newType;
        }

        return true;
    }
}

// Operation 2: DELETE EVENT TYPE (deleteEventType)
export class DeleteEventTypeBuilder extends OperationBuilder {
    typeIdtoRemove?: number = undefined;
    typeIdtoReplace?: number = undefined;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.typeIdtoRemove < 0 || this.typeIdtoRemove >= this.group.eventTypes.length) return false;
        if(this.typeIdtoReplace < 0 || this.typeIdtoReplace >= this.group.eventTypes.length) return false;

        return true;
    }

    async performOperation() {
        // Update the events to have the new type
        const newType = this.group.eventTypes[this.typeIdtoReplace];
        this.group.events.forEach(event => {
            if(event.eventType.id == this.typeIdtoRemove) {
                updateTypeForEvent(event, newType);
            }
        });

        // Delete the type out of the list of event types
        this.group.eventTypes.splice(this.typeIdtoRemove, 1);

        // Update all the type IDs
        this.group.eventTypes.forEach((type, index) => type.id = index);

        return true;
    }
}

// Operation 3: IMPORT/UPDATE EVENT (updateEvent)
export class UpdateEventBuilder extends OperationBuilder {
    eventId: number = undefined;
    eventTitle: string = undefined;
    rawEventDate: string = undefined;
    source: string = undefined;
    sourceType: string = undefined;
    eventTypeId: number = undefined;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        // Check if each of the inputs to the builder are valid
        if(this.eventId != -1 && (this.eventId < 0 
            || this.eventId >= this.group.events.length)) return false;
        if(this.sourceType != "GoogleSheets" && this.sourceType != "GoogleForms") return false;
        if(this.eventTypeId < 0 || this.eventTypeId >= this.group.eventTypes.length) return false;

        // If it passed all the checks, then return true
        return true;
    }

    async performOperation() {
        const eventDate = dayjs(this.rawEventDate);
        const eventType = this.group.eventTypes[this.eventTypeId];
        const sourceType: SourceType = SourceType[this.sourceType];
        if(!eventDate.isValid() || eventType == undefined) return false;

        // Check whether or not the event exists in the Group already
        let event: Event;
        if(this.eventId != -1) {
            event = this.group.events[this.eventId];

            // Clear question data and attendees if something about the event source changed
            if(event.source != this.source || event.sourceType != sourceType) {
                event.questionData = {
                    questionIds: [],
                    questionIdToPropertyMap: {},
                };
                event.sims = "";
            }

            // Update the event's type if it changed
            if(event.eventType.id != this.eventTypeId) {
                updateTypeForEvent(event, eventType);
            }

            // Update the properties of the existing event with the inputs
            event.eventName = this.eventTitle;
            event.eventDate = eventDate;
            event.source = this.source;
            event.sourceType = sourceType;

            // Reset the group because of the cleared question data
            return this.group.softReset();
        } else {

            // If the event doesn't exist, create a new event
            event = {
                eventName: this.eventTitle,
                semester: "",
                eventDate: eventDate,
                eventType: eventType,
                source: this.source,
                sourceType: sourceType,
                attendees: {},
                sims: "",
                questionData: {
                    questionIds: [],
                    questionIdToPropertyMap: {}
                }
            }
            this.group.events.push(event);
        }

        return true;
    }
}

// Operation 4: DELETE AN EVENT (deleteEvent)
export class DeleteEventBuilder extends OperationBuilder {
    eventId?: number = undefined;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.eventId < 0 || this.eventId >= this.group.events.length) return false;

        return true;
    }

    async performOperation() {
        const event = this.group.events[this.eventId];

        // Update information for the members who attended this event
        for(const utEID in event.attendees) {
            const member = event.attendees[utEID];

            const semester = getSemesterFromDate(event.eventDate);
            if(semester == "Fall") member.fallPoints -= event.eventType.points;
            if(semester == "Spring") member.springPoints -= event.eventType.points;
            member.totalPoints -= event.eventType.points;
        }

        // Remove the event from the list
        this.group.events.splice(this.eventId, 1);

        // Refresh the group to ensure info collected from the sheets are up to date
        return this.group.softReset();
    }
}

// Operation: EDIT QUESTION TO PROPERTY MATCHES (updateQuestionData)
export class UpdateQuestionDataBuilder extends OperationBuilder {
    eventId?: number = undefined;
    questionToPropertyMatches?: QuestionPropertyMatch[] = undefined;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.eventId < 0 || this.eventId >= this.group.events.length) return false;
        return true;
    }

    async performOperation() {
        const event = this.group.events[this.eventId];
        const questionData = getQuestionData(this.questionToPropertyMatches);
        if(!questionData) return false;

        // Update the question data for the event based on the input
        event.questionData = questionData;
        event.sims = this.group.getSims(questionData);

        // Refresh the group to ensure info collected from the sheets are up to date
        return this.group.softReset();
    }
}