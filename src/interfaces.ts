// All relevant interfaces and types

export type SimpleMap<K extends string | number | symbol, V> = {
    [key in K]: V;
};

export interface Member {
    memberID: number,
    firstName: string,
    lastName: string,
    utEID: string, // could move this to properties to make Member more generalized
    email: string,
    phoneNumber: string,
    graduationYear: number,
    birthday: Date,

    totalPoints: number
    properties: SimpleMap<string, string> // for additional properties, property name to property value
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

export interface QuestionData {
    questionIdToPropertyMap: SimpleMap<string, string>, // maps question IDs to member properties
    questionToIdMap: SimpleMap<string, string> // maps questions to corresponding question ID
}

export interface Event {
    eventName: string,
    eventDate: Date,
    eventType: EventType,
    source: string, // original link where the data came from
    sourceType: SourceType,
    attendees: Member[],
    lastUpdated: Date, // if the sign in hasn't been updated since the last time we checked, we don't have to do anything!

    sims: string, // sign in mapping string
    questionData: QuestionData, // container for question data

    memberProperties: string[] // lists all member properties (including firstName, lastName, utEID, etc.)
}

export interface QuestionPropertyMatch {
    question: string;
    questionId: string;
    property: string;
}

export interface GroupSettings {
    name: string,
    logSheetURI: string,
    version: string,
    simsIV: string,
    metadata: SimpleMap<string, string>
}