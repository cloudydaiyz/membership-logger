// Handles all Group functionality, including updating logs and log operations

class SIMSGenerator {

}

class Group {
    id: number;
	name: string;
	eventTypes!: EventType[];
    events!: Event[];
    members!: SimpleMap<string, Member>[];
    memberKey: string;
	simsGenerator: SIMSGenerator;
    logSheetURI: string;
    metadata!: SimpleMap<string, string>; // key-value map
    builders: SimpleMap<string, OperationBuilder> // maps a hash to a Builder

    constructor(id: number, name: string, logSheetURI: string) {
        this.id = id;
        this.name = name;
        this.logSheetURI = logSheetURI;
        this.memberKey = "utEID";
        this.simsGenerator = new SIMSGenerator();
        this.builders = {};
        
        this.obtainLogInfo();
    }

    obtainLogInfo(): boolean {
        this.eventTypes = [];
        this.events = [];
        this.members = [];
        this.metadata = {};

        // Obtain metadata

        // Obtain list of event types

        // Obtain list of events

        // Go through the list of events, and update members accordingly

        return true;
    }
}