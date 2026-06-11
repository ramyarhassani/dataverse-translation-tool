import { TranslationItem } from '../types';
import { log } from '../components/debug-log';

interface GuidLookup {
  [guid: string]: { type: string; parent: string };
}

const MAX_CONCURRENCY = 5;

/**
 * Resolve Object IDs to meaningful types (Entity, Attribute, Form, View, etc.)
 * using the Dataverse metadata APIs. Runs entities in parallel batches.
 */
export async function resolveObjectTypes(items: TranslationItem[]): Promise<void> {
  const entities = [...new Set(items.map(i => i.entity).filter(e => e.length > 0))];
  const guidLookup: GuidLookup = {};

  // Handle known non-API types first
  const apiEntities: string[] = [];
  for (const entity of entities) {
    if (entity.toLowerCase() === 'appaction') {
      items.filter(i => i.entity === entity).forEach(i => { i.objectType = 'Command'; });
    } else if (['solution', 'publisher', 'sitemap', 'appmodule'].includes(entity.toLowerCase())) {
      items.filter(i => i.entity === entity).forEach(i => { i.objectType = entity; });
    } else {
      apiEntities.push(entity);
    }
  }

  log('info', `Resolving metadata for ${apiEntities.length} entities...`);

  // Process in parallel batches
  for (let i = 0; i < apiEntities.length; i += MAX_CONCURRENCY) {
    const batch = apiEntities.slice(i, i + MAX_CONCURRENCY);
    log('debug', `Batch ${Math.floor(i / MAX_CONCURRENCY) + 1}: ${batch.join(', ')}`);
    await Promise.all(batch.map(entity => resolveEntity(entity, guidLookup)));
  }

  log('success', 'Metadata resolved');

  // Apply lookup to items
  for (const item of items) {
    if (item.objectType) continue;

    const objectId = item.context['Object ID'] || '';
    if (!objectId) continue;

    const info = guidLookup[objectId];
    if (info) {
      item.objectType = info.type;
      item.objectParent = info.parent;
    } else {
      const colName = item.context['Object Column Name'] || '';
      item.objectType = resolveByColumnName(colName);
    }
  }
}

/**
 * Resolve all metadata for a single entity (attributes, options, forms, views).
 */
async function resolveEntity(entity: string, guidLookup: GuidLookup): Promise<void> {
  try {
    // Run all metadata calls for this entity in parallel
    const [entityMeta, attrs, picklistData, statusData, forms, views] = await Promise.allSettled([
      window.dataverseAPI.getEntityMetadata(entity, true, ['MetadataId']),
      window.dataverseAPI.getEntityRelatedMetadata(entity, 'Attributes', ['MetadataId', 'LogicalName', 'SchemaName']),
      window.dataverseAPI.queryData(
        `EntityDefinitions(LogicalName='${entity}')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`
      ),
      window.dataverseAPI.queryData(
        `EntityDefinitions(LogicalName='${entity}')/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`
      ),
      window.dataverseAPI.queryData(
        `systemforms?$filter=objecttypecode eq '${entity}' and type eq 2&$select=formid,name,formxml`
      ),
      window.dataverseAPI.queryData(
        `savedqueries?$filter=returnedtypecode eq '${entity}'&$select=savedqueryid,name`
      ),
    ]);

    // 1. Entity MetadataId
    if (entityMeta.status === 'fulfilled' && entityMeta.value?.MetadataId) {
      guidLookup[entityMeta.value.MetadataId as string] = { type: 'Entity', parent: entity };
    }

    // 2. Attributes
    if (attrs.status === 'fulfilled') {
      const attrData = attrs.value as { value?: Array<Record<string, unknown>> };
      if (attrData?.value) {
        for (const attr of attrData.value) {
          if (attr.MetadataId) {
            guidLookup[attr.MetadataId as string] = { type: 'Attribute', parent: attr.LogicalName as string };
          }
        }
      }
    }

    // 3. Picklist options
    if (picklistData.status === 'fulfilled') {
      processOptionSetData(picklistData.value, guidLookup);
    }

    // 4. Status options
    if (statusData.status === 'fulfilled') {
      processOptionSetData(statusData.value, guidLookup);
    }

    // 5. Forms (Main only — type eq 2)
    if (forms.status === 'fulfilled' && forms.value?.value) {
      for (const form of forms.value.value) {
        const formId = form.formid as string;
        const formName = form.name as string;
        const formXml = form.formxml as string;

        if (formId) {
          guidLookup[formId] = { type: 'Form', parent: formName };
        }
        if (formXml) {
          parseFormXmlForGuids(formXml, formName, guidLookup);
        }
      }
    }

    // 6. Views
    if (views.status === 'fulfilled' && views.value?.value) {
      for (const view of views.value.value) {
        const viewId = view.savedqueryid as string;
        const viewName = view.name as string;
        if (viewId) {
          guidLookup[viewId] = { type: 'View', parent: viewName };
        }
      }
    }
  } catch {
    // If metadata lookup fails for this entity, continue
  }
}

function processOptionSetData(data: Record<string, unknown> | undefined, guidLookup: GuidLookup): void {
  if (!data || !(data as { value?: unknown[] }).value) return;
  for (const attr of (data as { value: Array<Record<string, unknown>> }).value) {
    const logName = attr.LogicalName as string;
    const optionSet = attr.OptionSet as { Options?: Array<{ MetadataId?: string }> };
    if (optionSet?.Options) {
      for (const opt of optionSet.Options) {
        if (opt.MetadataId) {
          guidLookup[opt.MetadataId] = { type: 'OptionSet Value', parent: logName };
        }
      }
    }
  }
}

function resolveByColumnName(colName: string): string {
  switch (colName) {
    case 'LocalizedCollectionName': return 'Entity (plural)';
    case 'LocalizedName': return 'Entity (singular)';
    case 'DisplayName':
    case 'displayname': return 'Label';
    case 'Description':
    case 'description': return 'Description';
    case 'name': return 'Name';
    default:
      if (colName.startsWith('button')) return 'Command';
      return colName;
  }
}

function parseFormXmlForGuids(formXml: string, formName: string, lookup: GuidLookup): void {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(formXml, 'application/xml');

    // Tabs
    const tabs = doc.querySelectorAll('tab');
    for (const tab of tabs) {
      const labelId = tab.getAttribute('labelid')?.replace(/[{}]/g, '');
      const tabLabel = tab.querySelector("labels > label[languagecode='1033']");
      const tabName = tabLabel?.getAttribute('description') || '';
      if (labelId) {
        lookup[labelId] = { type: 'Form Tab', parent: `${formName} → ${tabName}` };
      }
    }

    // Sections
    const sections = doc.querySelectorAll('section');
    for (const section of sections) {
      const labelId = section.getAttribute('labelid')?.replace(/[{}]/g, '');
      const secLabel = section.querySelector("labels > label[languagecode='1033']");
      const secName = secLabel?.getAttribute('description') || '';
      if (labelId) {
        lookup[labelId] = { type: 'Form Section', parent: `${formName} → ${secName}` };
      }
    }

    // Cells with labelid
    const cells = doc.querySelectorAll('cell[labelid]');
    for (const cell of cells) {
      const labelId = cell.getAttribute('labelid')?.replace(/[{}]/g, '');
      const cellLabel = cell.querySelector("labels > label[languagecode='1033']");
      const cellName = cellLabel?.getAttribute('description') || '';
      if (labelId && cellName) {
        lookup[labelId] = { type: 'Form Cell', parent: `${formName} → ${cellName}` };
      }
    }
  } catch {
    // Ignore malformed FormXML
  }
}
