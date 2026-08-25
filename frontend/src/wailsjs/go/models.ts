export namespace db {
	
	export class Configuration {
	    id: string;
	    name: string;
	    description?: string;
	    icon?: string;
	    providerId: string;
	    model: string;
	    spell: string;
	    inputType: string;
	    outputType: string;
	    temperature?: number;
	    maxTokens?: number;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Configuration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.icon = source["icon"];
	        this.providerId = source["providerId"];
	        this.model = source["model"];
	        this.spell = source["spell"];
	        this.inputType = source["inputType"];
	        this.outputType = source["outputType"];
	        this.temperature = source["temperature"];
	        this.maxTokens = source["maxTokens"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class Provider {
	    id: string;
	    name: string;
	    kind: string;
	    baseUrl?: string;
	    credentialRef?: string;
	    apiKeyEnv?: string;
	    headersJson?: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Provider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.baseUrl = source["baseUrl"];
	        this.credentialRef = source["credentialRef"];
	        this.apiKeyEnv = source["apiKeyEnv"];
	        this.headersJson = source["headersJson"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ProviderModel {
	    id: string;
	    providerId: string;
	    name: string;
	    displayName?: string;
	    createdAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ProviderModel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.providerId = source["providerId"];
	        this.name = source["name"];
	        this.displayName = source["displayName"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

