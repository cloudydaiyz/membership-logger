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
    eventsAttended: Event[]
}

export interface EventType {
    id: number,
    name: string,
    points: number
}

export type MemberProperty = "First Name" | "Last Name" | "UT EID" | "Email"
    | "Phone Number" | "Birthday" | "Major" | "Graduation Year";

export enum SourceType {
    GoogleForms,
    GoogleSheets
}

// exampleInput =
// 	{
// 		"question": "What is your first name?",
//		"questionId": "b9aef127",
//		"property": "First Name"
// 	}
export interface QuestionPropertyMatch {
    question: string;
    questionId: string;
    property: MemberProperty;
}

// One question to one ID and vice versa
export interface QuestionData {
    questionIds: string[], // list of all question Ids
    questionIdToPropertyMap: GenericMap<MemberProperty>, // maps question IDs to member properties
    questionIdToQuestionMap: GenericMap<string> // maps questions to corresponding question ID
}

export interface Event {
    eventName: string,
    semester: string,
    eventDate: Date,
    eventType: EventType,
    source: string, // original link where the data came from
    sourceType: SourceType, // note that question IDs for this event depends on the source type
    attendees: GenericMap<Member>,

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