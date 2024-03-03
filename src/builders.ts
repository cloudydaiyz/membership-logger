// All builders
// Whenever an operation requires more than one step, a builder is created
// for that operation in order to process the data through multiple requests.
import { Group } from "./group.js";
import { QuestionPropertyMatch } from "./interfaces.js";

export class OperationBuilder {
    hash: string;
    group: Group;
    keysToExclude: string[];

    constructor(hash: string, group: Group) {
        this.hash = hash;
        this.group = group;
        this.keysToExclude = [];
    }

    areAllOptionalFieldsSet(): boolean {
        const optionalFields = Object.keys(this)
            .filter(key => !(key in this.keysToExclude) && this[key as keyof this] === undefined);
        return optionalFields.length === 0;
    }
	
	build(): boolean {
        return this.areAllOptionalFieldsSet();
    }
}

export class UpdateEventBuilder extends OperationBuilder {
    eventID?: number;
    eventTitle?: string;
    eventDate?: string;
    signInSheetURI?: string;
    eventType?: string;
    lastUpdated?: Date;
    questionToPropertyMap?: QuestionPropertyMatch[];

    constructor(hash: string, group: Group) {
        super(hash, group);
    }

    build(): boolean {
        let sanityCheck = super.build();
        if(!sanityCheck) return false;

        return true;
    }
}

export class CreateSignInBuilder extends OperationBuilder {
    eventHostEmail?: string;
    eventTitle?: string;
    eventDate?: Date;
    signInTemplateURI?: string;
    questionToPropertyMap?: QuestionPropertyMatch[];

    constructor(hash: string, group: Group) {
        super(hash, group);
    }

    build(): boolean {
        let sanityCheck = super.build();
        if(!sanityCheck) return false;

        return false;
    }
}