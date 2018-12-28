import {
  GraphQLBoolean,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLFloat,
  GraphQLInputFieldConfigMap,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLString,
  Thunk
} from "graphql";
import Maybe from "graphql/tsutils/Maybe";
import "reflect-metadata";
const getParameterNames = require("get-parameter-names");

///////////////////////////////////////////////////////////////////////////////
//
// Keep track data collected when decorators are evaluated
//
const objectsBuilt = new WeakMap<Object, GraphQLObjectType>();
const objectFields = new WeakMap<Object, GraphQLFieldConfigMap<any, any>>();
const objectFieldParams = new WeakMap<
  Object,
  Map<string, Map<number, ParamConfigWrap>>
>();
const inputObjectsBuilt = new WeakMap<Object, GraphQLInputObjectType>();
const inputFields = new WeakMap<Object, GraphQLInputFieldConfigMap>();

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
  return function(daClass) {
    objectsBuilt.set(
      daClass,
      new GraphQLObjectType(
        Object.assign(
          {},
          {
            name: daClass.name,
            fields: objectFields.get(daClass.prototype) || {}
          },
          conf
        )
      )
    );
  };
}

export interface FieldConfig {
  type?: GraphQLOutputType;
  deprecationReason?: Maybe<string>;
  description?: Maybe<string>;

  args?: GraphQLFieldConfigArgumentMap;
  resolve?: GraphQLFieldResolver<any, any, any>;
  subscribe?: GraphQLFieldResolver<any, any, any>;
}

export function Field(
  conf: FieldConfig = {},
  typeWrap?: (t: any) => any
): PropertyDecorator {
  return function(target, propertyKey) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }

    const args: GraphQLFieldConfigArgumentMap = {};
    let guessType;
    let resolve: GraphQLFieldResolver<any, any, any> | undefined;

    const type = Reflect.getMetadata("design:type", target, propertyKey);
    if (type === Function) {
      const ptypes: any[] =
        Reflect.getMetadata("design:paramtypes", target, propertyKey) || [];
      const rtype = Reflect.getMetadata(
        "design:returntype",
        target,
        propertyKey
      );
      const daMethod: Function = (target as any)[propertyKey];
      const pnames = getParameterNames(daMethod);
      let paramConfigs: Map<number, ParamConfigWrap> | undefined;
      const objFieldParams = objectFieldParams.get(target);
      if (objFieldParams) {
        paramConfigs = objFieldParams.get(propertyKey) || new Map();
      }
      const argOrder: ParamConfigArg[] = [];

      for (let i = 0; i < Math.max(pnames.length, ptypes.length); i++) {
        const pname = pnames[i];
        const ptype = ptypes[i];
        const param = (paramConfigs && paramConfigs.get(i)) || { conf: {} };
        const pconf = param.conf;
        if (pconf === "context" || pconf === "info") {
          argOrder.push(pconf);
          continue;
        }
        const name = (pconf.name = pconf.name || pname);
        argOrder.push(pconf);
        args[name] = Object.assign(
          {},
          { type: metaDataTypeToGQLType(ptype) },
          pconf
        );
        if (!args[name].type) {
          throw new TypeError(
            `${
              target.constructor.name
            }.${propertyKey}[${i}] - Cannot guess the parameter type, specify it with @Param({type: ..}) `
          );
        }
        if (param.typeWrap) {
          args[name].type = param.typeWrap(args[name].type);
        }
      }
      guessType = metaDataTypeToGQLType(rtype);
      resolve = function(
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
        daMethod.apply(source, argsOrder);
      };
    } else {
      guessType = metaDataTypeToGQLType(type);
    }

    const qlFieldConfig = Object.assign(
      {},
      {
        type: guessType,
        args,
        resolve
      },
      conf
    );
    if (!qlFieldConfig.type) {
      throw new TypeError(
        `${
          target.constructor.name
        }.${propertyKey} - Cannot guess the GQL output type, specify it with @Field({type: ..}) `
      );
    }
    if (typeWrap) {
      qlFieldConfig.type = typeWrap(qlFieldConfig.type);
    }

    const map: GraphQLFieldConfigMap<any, any> = objectFields.get(target) || {};
    map[propertyKey] = qlFieldConfig;
    objectFields.set(target, map);
  };
}

export interface ParamConfig {
  name?: string;
  type?: GraphQLInputType;
  defaultValue?: any;
  description?: Maybe<string>;
}
type ParamConfigArg = "context" | "info" | ParamConfig;
type ParamConfigWrap = {
  conf: ParamConfigArg;
  typeWrap?: (t: any) => any;
};

export function Param(
  conf: ParamConfigArg = {},
  typeWrap?: (t: any) => any
): ParameterDecorator {
  return function(target, propertyKey, parameterIndex) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }
    const fieldMap: Map<string, Map<number, any>> =
      objectFieldParams.get(target) || new Map();
    const paramMap: Map<number, ParamConfigWrap> =
      fieldMap.get(propertyKey) || new Map();
    paramMap.set(parameterIndex, { conf, typeWrap });
    fieldMap.set(propertyKey, paramMap);
    objectFieldParams.set(target, fieldMap);
  };
}

export interface InputObjectTypeConfig {
  name?: string;
  description?: Maybe<string>;

  fields?: Thunk<GraphQLInputFieldConfigMap>;
}

export function InputObjectType(
  conf: InputObjectTypeConfig = {}
): ClassDecorator {
  return function(daClass) {
    inputObjectsBuilt.set(
      daClass,
      new GraphQLInputObjectType(
        Object.assign(
          {},
          {
            name: daClass.name,
            fields: inputFields.get(daClass.prototype) || {}
          },
          conf
        )
      )
    );
  };
}

export interface InputFieldConfig {
  type?: GraphQLInputType;
  defaultValue?: any;
  description?: Maybe<string>;
}

export function InputField(
  conf: InputFieldConfig = {},
  typeWrap?: (t: any) => any
): PropertyDecorator {
  return function(target, propertyKey) {
    if (typeof propertyKey !== "string") {
      throw new TypeError("Symbols are not supported");
    }

    const type = Reflect.getMetadata("design:type", target, propertyKey);
    const guessType = metaDataTypeToGQLType(type);

    const qlFieldConfig = Object.assign({}, { type: guessType }, conf);
    if (!qlFieldConfig.type) {
      throw new TypeError(
        `${
          target.constructor.name
        }.${propertyKey} - Cannot guess the GQL input type, specify it with @InputField({type: ..}) `
      );
    }
    if (typeWrap) {
      qlFieldConfig.type = typeWrap(qlFieldConfig.type);
    }

    const map: GraphQLInputFieldConfigMap = inputFields.get(target) || {};
    map[propertyKey] = qlFieldConfig;
    inputFields.set(target, map);
  };
}

///////////////////////////////////////////////////////////////////////////////
//
// Convenience for not-null (i.e. _B_ang!) and _L_ists
//

function wrapB(t: any) {
  return new GraphQLNonNull(t);
}
function wrapL(t: any) {
  return new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(t)));
}

export function ParamB(conf: ParamConfigArg = {}) {
  return Param(conf, wrapB);
}
export function ParamL(conf: ParamConfigArg = {}) {
  return Param(conf, wrapL);
}

export function FieldB(conf: FieldConfig = {}) {
  return Field(conf, wrapB);
}
export function FieldL(conf: FieldConfig = {}) {
  return Field(conf, wrapL);
}

export function InputFieldB(conf: InputFieldConfig = {}) {
  return InputField(conf, wrapB);
}
export function InputFieldL(conf: InputFieldConfig = {}) {
  return InputField(conf, wrapL);
}
