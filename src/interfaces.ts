// All relevant interfaces and types

export interface GenericMap<K> {
    [key: string]: K
}

export interface Member {
    // General Information
    memberID: number,
    firstName: string,
    lastName: string,
    utEID: string, // could move this to properties to make Member more generalized
    email: string,
    phoneNumber: string,
    birthday: Date,
    major: string,
    graduationYear: number,

    // Event Data
    totalPoints: number,
    properties: GenericMap<string>, // for additional properties, property name to property value
    eventsAttended: Event[]
}

export interface EventType {
    id: number,
    name: string,
    points: number
}

export enum SourceType {
    GoogleForms,
    GoogleSheets
}

// One question to one ID and vice versa
export interface QuestionData {
    questionIdToPropertyMap: GenericMap<string>, // maps question IDs to member properties
    questionToIdMap: GenericMap<string> // maps questions to corresponding question ID
}

export interface QuestionPropertyMatch {
    question: string;
    questionId: string;
    property: string;
}

export interface Event {
    eventName: string,
    eventDate: Date,
    eventType: EventType,
    source: string, // original link where the data came from
    sourceType: SourceType,
    attendees: Member[],

    sims: string, // sign in mapping string
    questionData: QuestionData, // container for question data
}

export interface GroupSettings {
    name: string,
    logSheetURI: string,
    version: string,
    simsIV: string,
    metadata: GenericMap<string>
}