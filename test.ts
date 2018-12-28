import test from "ava";
import { GraphQLInt, printSchema, GraphQLSchema, GraphQLString } from "graphql";
import {
  asGQLObject,
  Field,
  FieldB,
  FieldL,
  InputFieldB,
  InputFieldL,
  InputObjectType,
  ObjectType,
  Param,
  ParamB
} from "./";

@ObjectType()
class Foo {
  @Field()
  one: string = "";

  @FieldB()
  two: number = 0;

  @FieldB()
  three: boolean = true;

  @FieldL({ type: GraphQLString })
  four(@Param() aaa: string): string[] {
    return [`hi`];
  }
}

@InputObjectType()
class Bar {
  @InputFieldB()
  one: string = "";

  @InputFieldL({ type: GraphQLInt })
  two: number[] = [];
}

@ObjectType()
class Query {
  @FieldB()
  foo(): Foo {
    return new Foo();
  }

  @FieldB()
  hello(
    @Param("context") ctx: any,
    @Param("info") info: any,
    @ParamB() name: string
  ): string {
    return `Hello ${name}!`;
  }
}

@ObjectType()
class Mutation {
  @FieldB()
  foo(): Foo {
    return new Foo();
  }

  @FieldB()
  hello(
    @Param("context") ctx: any,
    @Param("info") info: any,
    @ParamB() name: string
  ): string {
    return `Hello ${name}!`;
  }
}

test("it", function(t) {
  const schema = new GraphQLSchema({
    query: asGQLObject(Query),
    mutation: asGQLObject(Mutation)
  });

  const schemaText = printSchema(schema, { commentDescriptions: true });

  t.is(
    schemaText.trim(),
    `
type Foo {
  one: String
  two: Float!
  three: Boolean!
  four(aaa: String): [String!]!
}

type Mutation {
  foo: Foo!
  hello(name: String!): String!
}

type Query {
  foo: Foo!
  hello(name: String!): String!
}
`.trim()
  );
});
