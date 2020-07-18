import {
  GraphQLBoolean,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLFloat,
  GraphQLInputFieldConfig,
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLString,
  Thunk,
} from "graphql";
import "reflect-metadata";
const getParameterNames = require("get-parameter-names");

type Maybe<T> = T | null | undefined;

///////////////////////////////////////////////////////////////////////////////
//
// Keep track data collected when decorators are evaluated
//
const objectsBuilt = new WeakMap<Object, GraphQLObjectType>();
const objectFields = new WeakMap<
  Object,
  { [name: string]: { conf: Thunk<FieldConfig>; typeWrap?: (t: any) => any } }
>();
const objectFieldParams = new WeakMap<
  Object,
  Map<string, Map<number, ParamConfigWrap>>
>();
const inputObjectsBuilt = new WeakMap<Object, GraphQLInputObjectType>();
const inputFields = new WeakMap<
  Object,
  {
    [name: string]: {
      conf: Thunk<InputFieldConfig>;
      typeWrap?: (t: any) => any;
    };
  }
>();

/**
 * Return the GraphQLObjectType version of a given class
 */
export function asGQLObject(t: any): GraphQLObjectType {
  const obj = objectsBuilt.get(t);
  if (!obj) {
    throw new TypeError(`Unable to asGQLObject. Not found in objectsBuilt`);
  }
  return obj;
}

/**
 * Guess the GraphQL type of a value emmited by TypeScript compiler using `reflect-metadata`
 */
function metaDataTypeToGQLType(
  t: any
): GraphQLScalarType | GraphQLObjectType | InputObjectTypeConfig | null {
  switch (t) {
    case String:
      return GraphQLString;
    case Number:
      return GraphQLFloat;
    case Boolean:
      return GraphQLBoolean;
  }
  const obj = objectsBuilt.get(t) || inputObjectsBuilt.get(t);
  if (obj) {
    return obj;
  }
  // Cannot guess the type... I wish TS emitted more detailed metadata.
  return null;
}

function asGQL(t: any): any {
  return metaDataTypeToGQLType(t) || t;
}

///////////////////////////////////////////////////////////////////////////////
//
// Decorators
//

export interface ObjectTypeConfig {
  name?: string;
  description?: Maybe<string>;

  interfaces?: Thunk<Maybe<GraphQLInterfaceType[]>>;
  fields?: Thunk<GraphQLFieldConfigMap<any, any>>;
  isTypeOf?: Maybe<GraphQLIsTypeOfFn<any, any>>;
}

export function ObjectType(conf: ObjectTypeConfig = {}): ClassDecorator {
  return function (daClass) {
    const target = daClass.prototype;
    objectsBuilt.set(
      daClass,
      new GraphQLObjectType(
        Object.assign(
          {},
          {
            name: daClass.name,
            fields(): GraphQLFieldConfigMap<any, any> {
              const fields: GraphQLFieldConfigMap<any, any> = {};
              const fieldsConfs = objectFields.get(target) || {};
              for (const name in fieldsConfs) {
                if (fieldsConfs.hasOwnProperty(name)) {
                  let { conf, typeWrap } = fieldsConfs[name];
                  if (typeof conf === "function") {
                    conf = conf();
                  }
                  fields[name] = buildField(target, name, conf, typeWrap);
                }
              }
              return fields;
            },
          },
          conf
        )
      )
    );
  };
}

export interface FieldConfig {
  type?: any;
  deprecationReason?: Maybe<string>;
  description?: Maybe<string>;

  args?: GraphQLFieldConfigArgumentMap;
  resolve?: GraphQLFieldResolver<any, any, any>;
  subscribe?: GraphQLFieldResolver<any, any, any>;
}

export function Field(
  conf: Thunk<FieldConfig> = {},
  typeWrap?: (t: any) => any
): PropertyDecorator {
  return function (target, propertyKey) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }
    const map: any = objectFields.get(target) || {};
    map[propertyKey] = { conf, typeWrap };
    objectFields.set(target, map);
  };
}

function buildField(
  target: Object,
  propertyKey: string,
  conf: FieldConfig,
  typeWrap?: (t: any) => any
): GraphQLFieldConfig<any, any> {
  const args: GraphQLFieldConfigArgumentMap = {};
  let guessType;
  let resolve: GraphQLFieldResolver<any, any, any> | undefined;

  const type = Reflect.getMetadata("design:type", target, propertyKey);
  if (type === Function) {
    const ptypes: any[] =
      Reflect.getMetadata("design:paramtypes", target, propertyKey) || [];
    const rtype = Reflect.getMetadata("design:returntype", target, propertyKey);
    const daMethod: Function = (target as any)[propertyKey];
    const pnames = getParameterNames(daMethod);
    let paramConfigs: Map<number, ParamConfigWrap> | undefined;
    const objFieldParams = objectFieldParams.get(target);
    if (objFieldParams) {
      paramConfigs = objFieldParams.get(propertyKey) || new Map();
    }
    const argOrder: ("context" | "info" | { name: string })[] = [];
    for (let i = 0; i < Math.max(pnames.length, ptypes.length); i++) {
      const pname = pnames[i];
      const ptype = ptypes[i];
      const param = (paramConfigs && paramConfigs.get(i)) || { conf: {} };
      if (param === "context" || param === "info") {
        argOrder.push(param);
        continue;
      }
      const pconf =
        typeof param.conf === "function" ? param.conf() : param.conf;
      const name = (pconf.name = pconf.name || pname);
      argOrder.push({ name });
      args[name] = Object.assign(
        {},
        { type: metaDataTypeToGQLType(ptype) },
        pconf
      );
      if (!args[name].type) {
        throw new TypeError(
          `${target.constructor.name}.${propertyKey}[${i}] - Cannot guess the parameter type, specify it with @Param({type: ..}) `
        );
      }
      args[name].type = asGQL(args[name].type);
      if (param.typeWrap) {
        args[name].type = param.typeWrap(args[name].type);
      }
    }
    guessType = metaDataTypeToGQLType(rtype);
    resolve = function (
      source: any,
      args: any,
      context: any,
      info: GraphQLResolveInfo
    ) {
      const argsOrder = [];
      for (const arg of argOrder) {
        switch (arg) {
          case "context":
            argsOrder.push(context);
            break;
          case "info":
            argsOrder.push(info);
            break;
          default:
            if (arg.name) {
              argsOrder.push(args[arg.name]);
            }
        }
      }
      return daMethod.apply(source, argsOrder);
    };
  } else {
    guessType = metaDataTypeToGQLType(type);
  }

  const qlFieldConfig = Object.assign(
    {},
    {
      type: guessType,
      args,
      resolve,
    },
    conf
  );
  if (!qlFieldConfig.type) {
    throw new TypeError(
      `${target.constructor.name}.${propertyKey} - Cannot guess the GQL output type, specify it with @Field({type: ..}) `
    );
  }
  qlFieldConfig.type = asGQL(qlFieldConfig.type);
  if (typeWrap) {
    qlFieldConfig.type = typeWrap(qlFieldConfig.type);
  }
  return qlFieldConfig;
}

export interface ParamConfig {
  name?: string;
  type?: any;
  defaultValue?: any;
  description?: Maybe<string>;
}
type ParamConfigWrap =
  | "context"
  | "info"
  | {
      conf: Thunk<ParamConfig>;
      typeWrap?: (t: any) => any;
    };

function makeParamDecorator(conf: ParamConfigWrap): ParameterDecorator {
  return function (target, propertyKey, parameterIndex) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }
    const fieldMap: Map<string, Map<number, any>> =
      objectFieldParams.get(target) || new Map();
    const paramMap: Map<number, ParamConfigWrap> =
      fieldMap.get(propertyKey) || new Map();
    paramMap.set(parameterIndex, conf);
    fieldMap.set(propertyKey, paramMap);
    objectFieldParams.set(target, fieldMap);
  };
}

export function Param(
  conf: Thunk<ParamConfig> = {},
  typeWrap?: (t: any) => any
): ParameterDecorator {
  return makeParamDecorator({ conf, typeWrap });
}

export function ParamCtx(): ParameterDecorator {
  return makeParamDecorator("context");
}

export function ParamInfo(): ParameterDecorator {
  return makeParamDecorator("info");
}

export interface InputObjectTypeConfig {
  name?: string;
  description?: Maybe<string>;

  fields?: Thunk<GraphQLInputFieldConfigMap>;
}

export function InputObjectType(
  conf: InputObjectTypeConfig = {}
): ClassDecorator {
  return function (daClass) {
    const target = daClass.prototype;
    inputObjectsBuilt.set(
      daClass,
      new GraphQLInputObjectType(
        Object.assign(
          {},
          {
            name: daClass.name,
            fields() {
              const fields: GraphQLInputFieldConfigMap = {};
              const fieldsConfs = inputFields.get(target) || {};
              for (const name in fieldsConfs) {
                if (fieldsConfs.hasOwnProperty(name)) {
                  let { conf, typeWrap } = fieldsConfs[name];
                  if (typeof conf === "function") {
                    conf = conf();
                  }
                  fields[name] = buildInputField(target, name, conf, typeWrap);
                }
              }
              return fields;
            },
          },
          conf
        )
      )
    );
  };
}

export interface InputFieldConfig {
  type?: any;
  defaultValue?: any;
  description?: Maybe<string>;
}

export function InputField(
  conf: Thunk<InputFieldConfig> = {},
  typeWrap?: (t: any) => any
): PropertyDecorator {
  return function (target, propertyKey) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }
    const map = inputFields.get(target) || {};
    map[propertyKey] = { conf, typeWrap };
    inputFields.set(target, map);
  };
}

function buildInputField(
  target: Object,
  propertyKey: string,
  conf: InputFieldConfig,
  typeWrap?: (t: any) => any
): GraphQLInputFieldConfig {
  const type = Reflect.getMetadata("design:type", target, propertyKey);
  const guessType = metaDataTypeToGQLType(type);

  const qlFieldConfig = Object.assign({}, { type: guessType }, conf);
  if (!qlFieldConfig.type) {
    throw new TypeError(
      `${target.constructor.name}.${propertyKey} - Cannot guess the GQL input type, specify it with @InputField({type: ..}) `
    );
  }
  qlFieldConfig.type = asGQL(qlFieldConfig.type);
  if (typeWrap) {
    qlFieldConfig.type = typeWrap(qlFieldConfig.type);
  }
  return qlFieldConfig;
}

///////////////////////////////////////////////////////////////////////////////
//
// Convenience for not-null (i.e. _B_ang!) and _L_ists
//

function wrapB(t: any) {
  return new GraphQLNonNull(t);
}
function wrapL(t: any) {
  return new GraphQLList(new GraphQLNonNull(t));
}
function wrapLB(t: any) {
  return wrapB(wrapL(t));
}

export function ParamB(conf?: Thunk<ParamConfig>) {
  return Param(conf, wrapB);
}
export function ParamL(conf?: Thunk<ParamConfig>) {
  return Param(conf, wrapL);
}
export function ParamLB(conf?: Thunk<ParamConfig>) {
  return Param(conf, wrapLB);
}

export function FieldB(conf?: Thunk<FieldConfig>) {
  return Field(conf, wrapB);
}
export function FieldL(conf?: Thunk<FieldConfig>) {
  return Field(conf, wrapL);
}
export function FieldLB(conf?: Thunk<FieldConfig>) {
  return Field(conf, wrapLB);
}

export function InputFieldB(conf?: Thunk<InputFieldConfig>) {
  return InputField(conf, wrapB);
}
export function InputFieldL(conf?: Thunk<InputFieldConfig>) {
  return InputField(conf, wrapL);
}
export function InputFieldLB(conf?: Thunk<InputFieldConfig>) {
  return InputField(conf, wrapLB);
}
