import test from "ava";
import { GraphQLInt, printSchema, GraphQLSchema, GraphQLString } from "graphql";
import {
  asGQLObject,
  Field,
  FieldB,
  FieldL,
  FieldLB,
  InputFieldB,
  InputFieldL,
  InputFieldLB,
  InputObjectType,
  ObjectType,
  Param,
  ParamCtx,
  ParamInfo,
  ParamB,
  InputField
} from "./";

@ObjectType()
class Foo {
  @Field()
  one: string = "";

  @FieldB()
  two: number = 0;

  @FieldB()
  three: boolean = true;

  @FieldL({ type: String })
  four(@Param() aaa: string): string[] {
    return [`hi`];
  }

  @FieldLB(() => ({ type: Baz }))
  circular: Baz[] = [];
}

@InputObjectType()
class Bar {
  @InputFieldB()
  one: string = "";

  @InputFieldLB({ type: GraphQLInt })
  two: number[] = [];

  @InputFieldL(() => ({ type: Qux }))
  circular?: Qux[];
}

@ObjectType()
class Baz {
  @Field()
  circular?: Foo;
}

@InputObjectType()
class Qux {
  @InputField()
  circular?: Bar;
}

@ObjectType()
class Query {
  @FieldB()
  foo(): Foo {
    return new Foo();
  }

  @Field()
  baz?: Baz;

  @FieldB()
  hello(
    @ParamCtx() ctx: any,
    @ParamInfo() info: any,
    @ParamB() name: string
  ): string {
    return `Hello ${name}!`;
  }
}

@ObjectType()
class Mutation {
  @FieldB({ type: Foo })
  async foo(bar: Bar): Promise<Foo> {
    return new Foo();
  }

  @FieldB()
  hello(
    @ParamCtx() ctx: any,
    @ParamInfo() info: any,
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
input Bar {
  one: String!
  two: [Int!]!
  circular: [Qux!]
}

type Baz {
  circular: Foo
}

type Foo {
  one: String
  two: Float!
  three: Boolean!
  four(aaa: String): [String!]
  circular: [Baz!]!
}

type Mutation {
  foo(bar: Bar): Foo!
  hello(name: String!): String!
}

type Query {
  foo: Foo!
  baz: Baz
  hello(name: String!): String!
}

input Qux {
  circular: Bar
}
`.trim()
  );
});
