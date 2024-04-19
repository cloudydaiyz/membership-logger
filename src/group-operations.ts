// All builders
// Whenever an operation requires more than one step, a builder is created
// for that operation in order to process the data through multiple requests.
import { Group, parseDateString } from "./group.js";
import { QuestionPropertyMatch, Event, EventType, SourceType, QuestionData, MemberProperty } from "./interfaces.js";
import crypto from "crypto";

// Updates an event's type
function updateTypeForEvent(event: Event, type: EventType) {
    for(const eid in event.attendees) {
        const member = event.attendees[eid];
        member.totalPoints -= event.eventType.points;
        member.totalPoints += type.points;
    }
    event.eventType = type;
} 

async function updateQuestionDataForEvent(group: Group, event: Event, data: QuestionData) {
    // Update event properties
    event.questionData = data;
    event.sims = group.getSims(data);

    // Refresh the group to make sure the information collected from the sheets are
    // up to date
    await group.refresh(false);
}

// Creates a new QuestionData object from a list of objects containing
// mappings between questions and member properties
export function getQuestionData(matchings: QuestionPropertyMatch[]) {
    const data: QuestionData = {
        questionIds: [],
        questionIdToPropertyMap: {},
        questionIdToQuestionMap: {}
    }

    // NOTE: If multiple questions map to the same property, only the last
    // question in the list will be used
    matchings.forEach((matching) => {
        if(data.questionIds.findIndex(id => id == matching.questionId) == -1) {
            data.questionIds.push(matching.questionId);
        }
        data.questionIdToPropertyMap[matching.questionId] = matching.property;
        data.questionIdToQuestionMap[matching.questionId] = matching.question;
    });

    return data;
};

export class OperationBuilder {
    hash: string;
    group: Group;

    constructor(group: Group) {
        this.hash = crypto.randomBytes(10).toString("hex");
        this.group = group;
    }

    areAllFieldsSet(): boolean {
        const fieldsUnset = Object.keys(this)
            .filter(key => this[key as keyof this] === undefined);
        return fieldsUnset.length === 0;
    }

    validateInput(): boolean {
        return false;
    }
	
	async performOperation(): Promise<boolean> {
        return this.areAllFieldsSet();
    }

    async build() {
        return this.areAllFieldsSet() && this.validateInput() 
            && await this.performOperation();
    }
}

// Operation 1: UPDATE EVENT TYPE
export class UpdateEventTypeBuilder extends OperationBuilder {
    typeID?: number;
    typeName?: string;
    points?: number;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        // Check if each of the inputs to the builder are valid
        if(this.typeID != -1 && (this.typeID < 0 
            || this.typeID >= this.group.eventTypes.length)) return false;
        if(this.points < 0) return false;

        // If it passed all the checks, then return true
        return true;
    }

    async performOperation() {
        // Create a new event type
        let newType: EventType = {
            id: this.group.eventTypes.length,
            name: this.typeName,
            points: this.points
        };

        if(this.typeID == -1) {
            // Add the type to the list of existing event types
            this.group.eventTypes.push(newType);
        } else {
            newType.id = this.typeID;

            // The type already exists -- update information for events with this type
            this.group.events.forEach(event => {
                updateTypeForEvent(event, newType);
            });

            // Replace the existing event type with this new one
            this.group.eventTypes[this.typeID] == newType;
        }

        return true;
    }
}

// Operation 2: DELETE EVENT TYPE
export class DeleteEventTypeBuilder extends OperationBuilder {
    typeIDtoRemove?: number;
    typeIDtoReplace?: number;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.typeIDtoRemove < 0 || this.typeIDtoRemove >= this.group.eventTypes.length) return false;
        if(this.typeIDtoReplace < 0 || this.typeIDtoReplace >= this.group.eventTypes.length) return false;

        return true;
    }

    async performOperation() {
        // Update the events to have the new type
        const newType = this.group.eventTypes[this.typeIDtoReplace];
        this.group.events.forEach(event => {
            updateTypeForEvent(event, newType);
        });

        // Delete the type out of the list of event types
        this.group.eventTypes.splice(this.typeIDtoRemove, 1);

        // Update all the type IDs
        this.group.eventTypes.forEach((type, index) => type.id = index);

        return true;
    }
}

// Operation 3: IMPORT/UPDATE EVENT
export class UpdateEventBuilder extends OperationBuilder {
    eventID?: number;
    eventTitle?: string;
    rawEventDate?: string;
    source?: string;
    sourceType?: string;
    rawEventType?: string;
    questionToPropertyMatches?: QuestionPropertyMatch[];

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        // Check if each of the inputs to the builder are valid
        if(this.eventID != -1 && (this.eventID < 0 
            || this.eventID >= this.group.events.length)) return false;
        if(parseDateString(this.rawEventDate) === undefined) return false;
        if(this.sourceType != "GoogleSheets" && this.sourceType != "GoogleForms") return false;
        if(this.group.eventTypes.filter(type => type.name != this.rawEventType).length == 0) return false;

        // If it passed all the checks, then return true
        return true;
    }

    async performOperation() {
        // Get event input from the raw input
        const eventDate = parseDateString(this.rawEventDate);
        const eventType = this.group.eventTypes.find(type => type.name == this.rawEventType);
        const sourceType: SourceType = SourceType[this.sourceType];

        const questionData = getQuestionData(this.questionToPropertyMatches);
        if(questionData == undefined) return false;

        // Check whether or not the event exists in the Group already
        let event: Event;
        if(0 <= this.eventID && this.eventID < this.group.events.length) {
            event = this.group.events[this.eventID];
            event.eventName = this.eventTitle;
            event.eventDate = eventDate;
            event.source = this.source;
            event.sourceType = sourceType;
            event.sims = this.group.getSims(questionData);
            event.questionData = questionData;

            // Update the event's type
            updateTypeForEvent(event, eventType);

            // Update the question data for the event based on the input
            await updateQuestionDataForEvent(this.group, event, questionData);
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
                sims: this.group.getSims(questionData),
                questionData: questionData
            }
        }

        // Retrieve member information from event, and return false on failure
        return await this.group.getMemberInfoFromEvent(event);
    }
}

// Operation 4: DELETE AN EVENT
export class DeleteEventBuilder extends OperationBuilder {
    eventID?: number;

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.eventID < 0 || this.eventID >= this.group.events.length) return false;

        return true;
    }

    async performOperation() {
        // Update information for the members who attended this event
        const event = this.group.events[this.eventID];
        for(const utEID in event.attendees) {
            const member = event.attendees[utEID];
            const eventIndex = member.eventsAttended.findIndex(currentEvent => event == currentEvent);
            member.eventsAttended.splice(eventIndex, 1);
            member.totalPoints -= event.eventType.points;
        }

        // Remove the event from the list
        this.group.events.splice(this.eventID, 1);
        return true;
    }
}

// Operation: EDIT QUESTION TO PROPERTY MATCHING
export class UpdateQuestionDataBuilder extends OperationBuilder {
    eventID?: number;
    questionToPropertyMatches?: QuestionPropertyMatch[];

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.eventID < 0 || this.eventID >= this.group.events.length) return false;

        return true;
    }

    async performOperation() {
        const event = this.group.events[this.eventID];
        const questionData = getQuestionData(this.questionToPropertyMatches);
        if(questionData == undefined) return false;

        // Update the question data for the event based on the input
        await updateQuestionDataForEvent(this.group, event, questionData);

        return false;
    }
}