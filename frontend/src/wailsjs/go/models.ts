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
	export class Execution {
	    id: string;
	    configurationId: string;
	    configurationName: string;
	    providerName: string;
	    model: string;
	    requestType: string;
	    input: string;
	    systemPrompt: string;
	    imageData?: string;
	    output: string;
	    error?: string;
	    status: string;
	    createdAt: number;
	    completedAt?: number;
	    durationMs: number;
	    firstTokenMs: number;
	    inputTokens: number;
	    outputTokens: number;
	    totalTokens: number;
	    tokensPerSec: number;
	
	    static createFrom(source: any = {}) {
	        return new Execution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.configurationId = source["configurationId"];
	        this.configurationName = source["configurationName"];
	        this.providerName = source["providerName"];
	        this.model = source["model"];
	        this.requestType = source["requestType"];
	        this.input = source["input"];
	        this.systemPrompt = source["systemPrompt"];
	        this.imageData = source["imageData"];
	        this.output = source["output"];
	        this.error = source["error"];
	        this.status = source["status"];
	        this.createdAt = source["createdAt"];
	        this.completedAt = source["completedAt"];
	        this.durationMs = source["durationMs"];
	        this.firstTokenMs = source["firstTokenMs"];
	        this.inputTokens = source["inputTokens"];
	        this.outputTokens = source["outputTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.tokensPerSec = source["tokensPerSec"];
	    }
	}
	export class ExecutionPage {
	    items: Execution[];
	    page: number;
	    pageSize: number;
	    total: number;
	    totalPages: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecutionPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], Execution);
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	        this.total = source["total"];
	        this.totalPages = source["totalPages"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
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
	export class StorageSettings {
	    databasePath: string;
	    imagesPath: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databasePath = source["databasePath"];
	        this.imagesPath = source["imagesPath"];
	    }
	}

}

