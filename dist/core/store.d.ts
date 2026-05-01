import type { Engram, Observation, MentalModel, Episode, GraphData, FeedbackEntry, Memory, FlyupMemConfig } from './types.js';
export declare class FlyupMemStore {
    readonly basePath: string;
    readonly config: FlyupMemConfig;
    private _engrams;
    private _observations;
    private _mentalModels;
    private _episodes;
    private _graph;
    private _feedback;
    private _loaded;
    constructor(config?: Partial<FlyupMemConfig>);
    private get paths();
    load(): void;
    private loadYaml;
    private loadYamlOne;
    save(): void;
    get engrams(): Engram[];
    get observations(): Observation[];
    get mentalModels(): MentalModel[];
    get episodes(): Episode[];
    get graph(): GraphData;
    get feedback(): FeedbackEntry[];
    allMemories(): Memory[];
    getById(id: string): Memory | undefined;
    getEngramById(id: string): Engram | undefined;
    addEngram(engram: Engram): void;
    updateEngram(id: string, updates: Partial<Engram>): void;
    addObservation(obs: Observation): void;
    addMentalModel(mm: MentalModel): void;
    addEpisode(ep: Episode): void;
    addFeedback(fb: FeedbackEntry): void;
    addEdge(from: string, to: string, type: GraphData['edges'][0]['type'], weight: number): void;
    addEntity(name: string, type: string, memoryId: string): void;
    /**
     * Find engram by content hash (exact dedup).
     */
    findByHash(hash: string): Engram | undefined;
    /**
     * Count feedback signals for a memory within last N days.
     */
    countRecentFeedback(memoryId: string, signal: FeedbackEntry['signal'], days: number): number;
    healthCheck(): {
        ok: boolean;
        issues: string[];
    };
    stats(): {
        engrams: {
            total: number;
            active: number;
            candidate: number;
            fading: number;
            dormant: number;
            retired: number;
            locked: number;
        };
        observations: number;
        mentalModels: number;
        episodes: number;
        graphEntities: number;
        graphEdges: number;
        feedback: number;
    };
}
//# sourceMappingURL=store.d.ts.map