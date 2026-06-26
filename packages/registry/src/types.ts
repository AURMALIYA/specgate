import type {
  AccessMatrixRow,
  Frontmatter,
  ParsedSpec,
  SpecContract,
} from "@specgate/spec-schema";

/** A spec as stored in the registry. */
export interface SpecRecord {
  id: string;
  path?: string;
  frontmatter: Frontmatter;
  accessMatrix: AccessMatrixRow[];
  provides: string[];
  consumes: string[];
  dependsOn: string[];
  contracts: SpecContract[];
  contentHash: string;
}

export function recordFromParsed(spec: ParsedSpec): SpecRecord {
  return {
    id: spec.frontmatter.id,
    path: spec.path,
    frontmatter: spec.frontmatter,
    accessMatrix: spec.accessMatrix,
    provides: spec.frontmatter.provides,
    consumes: spec.frontmatter.consumes,
    dependsOn: spec.frontmatter.depends_on,
    contracts: spec.frontmatter.contracts,
    contentHash: spec.contentHash,
  };
}

/** Pluggable persistence for spec records. */
export interface StorageAdapter {
  put(record: SpecRecord): void;
  get(id: string): SpecRecord | undefined;
  all(): SpecRecord[];
  delete(id: string): void;
}

/** A flattened access-matrix row tagged with its source spec. */
export interface TaggedAccessRow {
  specId: string;
  path?: string;
  row: AccessMatrixRow;
}

/** A contract declaration tagged with its source spec. */
export interface TaggedContract {
  specId: string;
  contract: SpecContract;
}
