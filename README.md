# thin-graphql-decorators

[![Build Status](https://travis-ci.org/smallhelm/thin-graphql-decorators.svg)](https://travis-ci.org/smallhelm/thin-graphql-decorators)

Use [GraphQL.js](https://graphql.org/graphql-js/) to create schemas, this library adds a few light-weight decorators that make object definitions less verbose.

There are _a lot_ of other graphql-schema builders that use decorators. (see [Alternatives](#alternatives) below) This one is minimal. The goal is to use the [graphql](https://graphql.org/graphql-js/) library directly, instead of trying to wrap it or add to it. This library simply adds a few decorators that solve the key painpoint in using GraphQL.js, namely needing to define an object twice, once for the graphql schema, and again for your internal model. `thin-graphql-decorators` allow you to simultaneously define a `class` and `GraphQLObjectType`.

## Example

```ts
import { GraphQLSchema } from "graphql";
import { asGQLObject, Field, ObjectType } from "./";

@ObjectType()
class Query {
  @Field()
  hello(name: string): string {
    return `Hello ${name}!`;
  }
}

const schema = new GraphQLSchema({
  query: asGQLObject(Query)
});
```

For more examples see [test.ts](https://github.com/smallhelm/thin-graphql-decorators/blob/master/test.ts)

## Install

```sh
npm i --save thin-graphql-decorators graphql
```

Enable these 2 flags in your `tsconfig.json`

```
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
     ...
```

## API

The decorators take a single argument that allows you to configure the graphql type. For the most part they are a strict subset of the GraphQL.js naming conventions. See [index.ts](https://github.com/smallhelm/thin-graphql-decorators/blob/master/index.ts) for the configuration interfaces.

`Field`, `Param`, `InputField` all have a convenience variant that makes the type non-null or a list.

- `B` - \_B_ang! i.e. `new GraphQLNonNull(t)` or `t!`
- `L` - \_L_ist i.e. `new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(t)))` or `[t!]!`

i.e. `FieldB` means a field that cannot be null `!`
i.e. `ParamL` means an argument that is a list `[..!]!`

### @ObjectType()

#### @Field()

#### @Param()

#### @Param("context")

Bind the decorated parameter to the schmea `context`.

#### @Param("info")

Bind the decorated parameter to the schmea `info`.

### @InputObjectType()

#### @InputField()

### asGQLObject(c)

Given a class that was decorated with `@ObjectType()` return it's `GraphQLObjectType` instance.

## Alternatives

Does this library do to little? Here are some of the alternatives I evaluated before building this library:

- [type-graphql](https://19majkel94.github.io/type-graphql/) - It's the most popular. It does a lot and is framework like.
- [typegql](https://prismake.github.io/typegql/) - Lighter weight than type-graphql.
- [decapi](https://decapi.netlify.com/) - A fork of typegql that adds more stuff.
- [graphql-schema-bindings](https://github.com/IBM/graphql-schema-bindings)
- [metanoia](https://github.com/voodooattack/metanoia)

NOTE: At this time, TypeScript does not emit very detailed type information that can be used for reflection. So all decorators will be limited by how much they can infer types. I.e. cannot detect a list type, or the Promise resolve type.

## License

MIT
