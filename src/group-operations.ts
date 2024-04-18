// All builders
// Whenever an operation requires more than one step, a builder is created
// for that operation in order to process the data through multiple requests.
import { Group, parseDateString } from "./group.js";
import { QuestionPropertyMatch, Event, SourceType, QuestionData } from "./interfaces.js";
import crypto from "crypto";

export class OperationBuilder {
    hash: string;
    group: Group;
    keysToExclude: string[];

    constructor(group: Group) {
        this.hash = crypto.randomBytes(10).toString("hex");
        this.group = group;
        this.keysToExclude = [];
    }

    areAllOptionalFieldsSet() {
        const optionalFields = Object.keys(this)
            .filter(key => !(key in this.keysToExclude) && this[key as keyof this] === undefined);
        return optionalFields.length === 0;
    }

    log(message: string) {
        console.log(message);
    }
	
	build() {
        return this.areAllOptionalFieldsSet();
    }
}

// Operation 1: UPDATE EVENT TYPE
export class UpdateEventTypeBuilder extends OperationBuilder {

}

// Operation 2: DELETE EVENT TYPE
export class DeleteEventTypeBuilder extends OperationBuilder {

}

// Operation 3: IMPORT/UPDATE EVENT
export class UpdateEventBuilder extends OperationBuilder {
    eventID?: number;
    eventTitle?: string;
    rawEventDate?: string;
    source?: string;
    sourceType?: string;
    rawEventType?: string;
    questionToPropertyMap?: QuestionPropertyMatch[];

    constructor(group: Group) {
        super(group);
    }

    validateInput() {
        if(this.eventID < 0 || this.eventID > this.group.events.length) return false;
        if(parseDateString(this.rawEventDate) === undefined) return false;
        if(this.sourceType != "GoogleSheets" && this.sourceType != "GoogleForms") return false;
        if(this.group.eventTypes.filter(type => type.name != this.rawEventType).length == 0) return false;

        return true;
    }

    build() {
        // Perform sanity check first
        if(!super.build() || !this.validateInput()) return false;

        // Update input
        const eventDate = parseDateString(this.rawEventDate);
        const eventType = this.group.eventTypes.find(type => type.name == this.rawEventType);
        const sourceType: SourceType = SourceType[this.sourceType];

        // Check whether or not the event exists in the Group already
        let event: Event;
        if(0 <= this.eventID && this.eventID < this.group.events.length) {
            event = this.group.events[this.eventID];
            event.eventName = this.eventTitle;
            event.eventDate = eventDate;
            event.eventType = eventType;
            event.source = this.source;
            event.sourceType = sourceType;
        } else {
            // If the event doesn't exist, create a new event
            let questionData: QuestionData = {
                questionIdToPropertyMap: {},
                questionToIdMap: {}
            };

            event = {
                eventName: this.eventTitle,
                eventDate: eventDate,
                eventType: eventType,
                source: this.source,
                sourceType: sourceType,
                attendees: [],
                sims: "",
                questionData: questionData
            }
        }

        // Retrieve member information from event, and return false on failure
        this.group.getMemberInfoFromEvent(event);
        return true;
    }
}

// Operation 4: DELETE AN EVENT
export class DeleteEventBuilder extends OperationBuilder {

}

// Operation 5: CREATE A NEW SIGN IN
export class CreateSignInBuilder extends OperationBuilder {
    eventHostEmail?: string;
    eventTitle?: string;
    eventDate?: Date;
    signInTemplateURI?: string;
    questionToPropertyMap?: QuestionPropertyMatch[];

    constructor(group: Group) {
        super(group);
    }

    build() {
        let sanityCheck = super.build();
        if(!sanityCheck) return false;

        return false;
    }
}