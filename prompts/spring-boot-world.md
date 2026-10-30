# Prompt: build a nuhokai world from a Spring Boot project

Paste everything below the line into an agent that can read the Java project, run shell commands and write files. Fill
in the three settings first.

---

You are documenting an existing Java Spring Boot application as a **nuhokai world**: a folder `nuhokai/` in the
project root where every node is a TypeScript file built with `@nuhokai/world`, and every dependency is a typed
reference to another node's port. You describe the code as it is today. You do not change, refactor or "fix" any Java
code, and you never invent behaviour the code does not have.

Settings:
- Project directory: `<path, the folder holding pom.xml or build.gradle>`
- Base package: `<e.g. com.acme.shop>`, or "detect" (the package of the `@SpringBootApplication` class)
- World name: `<e.g. acme-shop>`, or "detect" (`spring.application.name`, else the artifactId)

## 0. Learn the format first

Run `nuhokai init` in the project directory, delete the example node `nuhokai/example.ts`, then read
`nuhokai/.generated/world/index.d.ts`. It holds the format's types and their docs, and it wins over anything in this
prompt. The essentials:
- `node({ id, purpose, status, source, ports?, children?, implements?, abstract?, external?, externalType?, group?,
  requirements?, testCases?, decisions? }).edges({ uses?: () => [...] })`. `.edges()` is required, also as
  `.edges({})`.
- A **leaf** declares its own `ports` (`{ name: { kind: "call", purpose, input?, output?, errors?, transport? } }` or
  `{ kind: "event", purpose, payload? }`) and may have `uses` edges to other nodes' ports.
- A **dome** has `children: { name: Node }` and `ports: (c) => ({ name: c.child.ports.port })`, or `ports: () => ({})`
  when it exposes nothing. It has no `uses` of its own and declares no port shapes: every port it has is a direct
  child's port, passed through.
- An **abstract** node is a contract: its ports are inherited by every node that `implements` it, never redeclared.
  It has no `uses`, no `implements` and no children. A contract can be a dome's child.
- An **external** node is not built by us: top level only, no children, `source: []`, `externalType` `"caller"`,
  `"api"` or `"db"`. It may have ports and `uses` edges.
- **Scope:** a `uses` edge may only target a sibling or a sibling of an ancestor. A node inside another dome is
  reachable only through a port that dome exposes.
- `tbd.call({ description })` / `tbd.event({ description })` is a placeholder for a dependency whose target is unknown.
- World files are declarative: they import only `@nuhokai/world` and other world files, call only the format's
  functions, and have no casts except `as const`, no `!`, no `any` and no `@ts-` directives. Node files never import
  `nuhokai/index.ts`.

## 1. Inventory before writing anything

Read the whole of `src/main/java` (and `src/main/resources/application*.{yml,yaml,properties}`). Build an inventory
and write it to `nuhokai/inventory.md`:
- the package tree below the base package, marking each package as a node (P1) or not (P2);
- one row per top-level type: fully qualified name, kind (class, interface, enum, record), Spring stereotype, whether
  it is a node (C1) or a data type (C2), its node file, or for a data type the node it is folded into (C3), and its
  outgoing dependencies;
- every HTTP entry point: HTTP method, full path (class-level `@RequestMapping` prefix plus method mapping, with
  `server.servlet.context-path` and `spring.mvc.servlet.path` applied), handler class and method, request body, path
  and query parameters, response type and status, mapped errors;
- every other entry point: `@Scheduled`, `@KafkaListener`, `@RabbitListener`, `@JmsListener`, `@SqsListener`,
  `@EventListener`, `@TransactionalEventListener`, `CommandLineRunner`, `ApplicationRunner`;
- every external system: datasources, caches, brokers, outbound HTTP clients (`@FeignClient`, `RestTemplate`,
  `RestClient`, `WebClient`, `@HttpExchange`), with the configuration key that names each.

Only then write node files. Do not skip the inventory; it is how you make sure no class, package and endpoint is
missed.

## 2. Mapping rules

### Packages

- **P1. Every package below the base package that contains at least one class node (C1), directly or in a
  subpackage, becomes a dome.** Its children are the class nodes directly in it and the domes of its subpackages.
  Classes directly in the base package, and the domes of its direct subpackages, are top-level nodes.
- **P2. A package that contains only data types (C2), directly and in all its subpackages, is not a node.** Its types
  are folded (C3).
- **P3. Name:** the PascalCase of the package's last segment (`com.acme.shop.orders` → `Orders`, `order_items` →
  `OrderItems`). If that clashes with a sibling class node, append `Package` (`OrdersPackage`).
- **P4. File:** `nuhokai/<package path below the base package, kebab-case>.ts`, created with `nuhokai new`, e.g.
  `com.acme.shop.orders.web` → `nuhokai new orders/web` → `nuhokai/orders/web.ts`. Its class nodes and subpackage domes
  live in the folder of the same name (`nuhokai/orders/web/…`).
- **P5. Source:** the package's folder and everything below it, `["src/main/java/com/acme/shop/orders/**"]`.
- **P6. Purpose:** what the package as a whole is responsible for and what it leaves to other packages, from
  `package-info.java` and its classes.
- **P7. Exposed ports:** a dome exposes exactly the ports of its children that something outside it uses: another
  package's class, an external such as `SpringRouter`, or a listener elsewhere. It passes them through every enclosing
  dome up to the level where the caller can reach it (the scope rule in step 0). An exposed port keeps its child's
  port name; if two children's port names clash, prefix the child's name (`orderRepositorySave`). An implementor's
  inherited port is exposed with `inherited(c.child, Contract.port)`. A dome that nothing outside it uses has
  `ports: () => ({})`.
- **P8. Group:** inside a dome, set `group` on each class node to its layer, so the map stacks a layer's islands
  together: `"web"` (controllers, advice, filters), `"service"`, `"persistence"` (repositories, DAOs), `"messaging"`,
  `"client"` (outbound API clients), `"config"` (`@Configuration`, properties classes), `"other"`. Leave it out if
  every class in the dome would get the same group.

### Classes

- **C1. Every top-level type in `src/main/java` that has behaviour becomes exactly one leaf node** (or one contract,
  C4): Spring beans of every stereotype, controllers, configuration and properties classes, utilities, and any class
  with a method other nodes call that does more than read or write its own fields. Nested, inner, local and anonymous
  types are part of their enclosing type's node, never their own (they share its file, and a file has one owner).
- **C2. Data types are not nodes:** `@Entity`, `@Embeddable`, `@MappedSuperclass`, records and DTOs, request and
  response bodies, value objects with no behaviour, enums, exceptions, events (`ApplicationEvent` subclasses and event
  records), projections and annotation types.
- **C3. Each data type is folded into one node**, by adding its file to that node's `source` and naming it in the
  node's doc comment (`/** Also owns OrderResponse, OrderLineResponse. */`). The owner is the class node that uses it
  most, in this order of precedence: a JPA repository owns its entity (`JpaRepository<Order, …>` owns `Order`); the
  class that throws an exception owns it; the publisher owns its event; the controller whose handler takes or returns
  a request or response type owns it; otherwise the class node with the most references to it. The owner must lie
  inside the innermost package dome that contains the data type's package (anywhere, if no package dome contains it),
  or `nuhokai check` reports the file as owned twice. If no class node there uses the type, fold nothing: the package
  dome's `source` already covers it; list it in the report.
- **C4. Interfaces with at least one implementing class in the project** become abstract contract nodes; each
  implementor `implements` them. Interfaces with no implementing class (Spring Data repositories, `@FeignClient`,
  `@HttpExchange`) become ordinary leaves, because Spring generates their implementation. Abstract classes are
  ordinary leaves; name the base class in a subclass's `purpose`.
- **C5. Name:** the class's simple name (`OrderService`). Names only have to be unique among siblings, so a clash
  cannot happen inside one package except with a package dome (P3).
- **C6. File:** `nuhokai/<package path below the base package, kebab-case>/<class name, kebab-case>.ts`, created with
  `nuhokai new`, e.g. `com.acme.shop.orders.OrderService` → `nuhokai new orders/order-service`. `nuhokai new` writes a
  fresh id; never write ids by hand and never reuse one. If `nuhokai new` changes an acronym's case
  (`HTTPClient` → `HttpClient`), rename the export back to the class's name.
- **C7. Source:** the class's own `.java` file plus the files of the data types folded into it, e.g.
  `["src/main/java/com/acme/shop/orders/OrderService.java", "src/main/java/com/acme/shop/orders/OrderNotFoundException.java"]`.
  The world's `source` is `["src/main/java/**"]`.
- **C8. Status:** every node is `"built"`, as is every external. A class marked `@Deprecated` is `"deprecated"`; a
  package dome whose class nodes are all deprecated is too.
- **C9. The `@SpringBootApplication` class** is a node like any other; its `purpose` says it boots the application.

### HTTP entry points and the SpringRouter

- **H1. One external node, `SpringRouter`** (`externalType: "caller"`, `nuhokai/externals/spring-router.ts`), stands for
  Spring MVC's dispatcher: it is framework code, not ours, and it is how every HTTP request enters the application.
  Every HTTP entry point of the project is one of its ports, and nothing else is.
- **H2. Every handler method is one `call` port on its controller node**, named after the Java method (overloads get
  a suffix), with `purpose` starting with the HTTP method and full path (`"GET /api/orders/{id}: load one order"`).
  The controller's package domes expose it (P7), so `SpringRouter` can reach it.
- **H3. `SpringRouter` has one port per handler method**, with `transport: "http"`, named `<method><Path>` in camelCase,
  path variables as `By<Var>`: `POST /api/orders` → `postApiOrders`, `GET /api/orders/{id}` → `getApiOrdersById`.
  A method mapped to several paths or verbs gets one port under the first, with the others in its `purpose`. On a
  name clash, append the controller's name. `SpringRouter` `uses` each handler port, through the top-level dome that
  exposes it.
- **H4. The router port carries the HTTP contract:** `input` names the body type and path and query parameters;
  `output` the success status and response type (`"200 OrderResponse"`); `errors` each status the endpoint answers
  with and why (`"404 order not found"`), from `@ResponseStatus`, `ResponseStatusException`, `ResponseEntity` branches
  and the `@ControllerAdvice` mappings for the exceptions its call path throws. A `@Valid` body adds `"400 invalid
  request"`. The controller port carries the Java contract: argument types, return type, thrown exceptions.
- **H5. Web-only classes** (`@ControllerAdvice`, `HandlerInterceptor`s, servlet `Filter`s, `WebMvcConfigurer`s) are
  ordinary class nodes in their package (group `"web"`). Their effect shows in the router ports' `errors` and in
  constraints (H6).
- **H6. Spring Security:** the configuration class is an ordinary class node. `@PreAuthorize` / `@Secured` rules and
  the filter chain's path rules become a `constraint` requirement on each affected controller (`"GET /api/admin/**
  requires role ADMIN"`).

### Ports of other nodes

- **O1. Services and components:** one `call` port per public method another node calls, named after the method.
  Leave out getters, setters, `equals`, `hashCode`, `toString`, builders and methods nobody outside the class calls.
- **O2. Repositories:** one port per repository method another node calls, inherited ones such as `save` and
  `findById` included.
- **O3. Contracts:** an abstract node's ports are its interface's methods; implementors do not redeclare them and only
  add ports for their extra public methods.
- **O4. Shapes are prose that names the Java types**: `input: "PlaceOrderCommand (customer id, lines)"`,
  `output: "Optional<Order>"`, `errors: ["OrderNotFoundException"]`. Every checked exception, and every unchecked one
  the method deliberately throws, belongs in `errors`.
- **O5. Events:** `ApplicationEventPublisher.publishEvent(X)` gives the publisher an `event` port named after `X`
  (`orderPlaced`, `payload: "OrderPlacedEvent"`); every `@EventListener` / `@TransactionalEventListener` for `X` `uses`
  that port. If several classes publish `X`, each gets the port.
- **O6. Other entry points:** `@Scheduled` methods are `call` ports with the schedule in `purpose`, used by one
  external `Scheduler` caller node. Message listeners `uses` an `event` port on the broker's external node, one per
  topic or queue (`ordersTopic`); producers (`KafkaTemplate.send` and friends) `uses` a `call` port on it
  (`publishOrdersTopic`).

### Edges

- **E1. A `uses` edge exists for every call or event subscription from one class node to another**, pointing at
  exactly the ports used. Find them from the injected dependencies (constructor parameters, `@Autowired` / `@Inject`
  fields and setters, `@Bean` method parameters) and the methods actually called on them. A dependency that is
  injected but never called gives no edge.
- **E2. The edge follows the declared type:** a field typed as an interface uses the contract's port, not an
  implementor's; a field typed as a concrete class uses that class's port.
- **E3. The edge goes through the domes:** a call to a class in the caller's own package targets the class directly
  (`OrderRepository.findById`); a call into another package targets the port exposed by the outermost dome the caller
  can reach (`Billing.charge`, which `Billing` passes through from its child). Add the exposure (P7) for every such
  call.
- **E4. Calls inside one node** (including to the data types folded into it) and calls to getters of data types are
  not edges.
- **E5. Static utility calls** to a project class are edges to a port on that class.
- **E6. A dependency you cannot resolve** (reflection, `ApplicationContext.getBean`, a dynamic qualifier, a call
  through a generic handler map) is a `tbd.call` / `tbd.event` describing what is called and why it is unresolved,
  declared in `nuhokai/holes.ts` and exported. Never guess a target.

### Externals

- **X1. One external node per external system**, top level, in `nuhokai/externals/`: each datasource (`db`, named
  after the product and database, `OrdersPostgres`), cache (`db`), broker (`api`), and outbound HTTP API (`api`, named
  after the service). Its ports are only the operations the project uses: a datasource has `query` with
  `transport: "jdbc"` (or `"r2dbc"`, `"mongodb"`, …), an HTTP API one port per endpoint called, with
  `transport: "http"` and method and path in `purpose`.
- **X2. Feign / `@HttpExchange` interfaces** are class nodes (C4) that `uses` the external API's ports;
  `RestTemplate` / `WebClient` callers use the external API's ports directly.
- **X3. Repositories, `JdbcTemplate` and `EntityManager` users** `uses` the datasource's `query` port.

### Specs: requirements, test cases, decisions

- **T1. Test cases come from tests:** for each JUnit test that targets a node, add one `testCases` entry to that node:
  what is done and what is expected, in one plain sentence (use `@DisplayName` if present). Integration tests
  (`@SpringBootTest`, `@WebMvcTest`) belong to the node they enter through, usually a controller.
- **T2. Requirements come from code, never from imagination:** Bean Validation on request types, `@PreAuthorize`,
  `@Transactional` boundaries, idempotency and uniqueness checks become requirements (`constraint` where they guard
  how, not what). If a node has no evident requirement, leave `requirements` out.
- **T3. Decisions** only when the code or the repository documents one (ADRs, README, a comment explaining why).
  Otherwise leave `decisions` out.
- **T4. Purpose:** one or two sentences: what the node owns and what it deliberately does not do, from the Javadoc
  and the code. If you are not sure, write the best reading and end it with `(unverified)`.

## 3. The world file

`nuhokai/index.ts` sets `name`, a one-sentence `description`, `source: ["src/main/java/**"]`, and lists every
top-level node: the class nodes directly in the base package, the domes of its direct subpackages, and every
external, `SpringRouter` included. Every other node is listed by its dome, and nowhere else.

## 4. Check, then map

Run `nuhokai check` and fix every error and warning (orphans are nodes you forgot to list) until it prints nothing and
exits 0. Fix the world, never the Java. Then run `nuhokai map` to write `nuhokai/.generated/map.html`.

## 5. Report

Finish with:
1. counts: packages vs. package domes, classes vs. class nodes plus folded data types (they must add up, minus nested
   types), HTTP endpoints vs. `SpringRouter` ports (they must match);
2. every `tbd` placeholder and why it is unresolved;
3. every data type left unfolded (C3), every `(unverified)` purpose and every renamed node;
4. anything you could not map with these rules, and what you did instead.

## Example

Base package `com.acme.shop`; packages `web` (with `web.dto`, data only), `orders` and `entity` (data only).

```ts
// nuhokai/web/order-controller.ts
import { node } from "@nuhokai/world";
import { Orders } from "../orders.ts";

/** @RestController @RequestMapping("/api/orders"). Also owns OrderResponse. */
export const OrderController = node({
  id: "<written by nuhokai new>",
  purpose: "Translates the orders HTTP API to calls into Orders; holds no business rules.",
  status: "built",
  source: [
    "src/main/java/com/acme/shop/web/OrderController.java",
    "src/main/java/com/acme/shop/web/dto/OrderResponse.java",
  ],
  ports: {
    get: {
      kind: "call",
      purpose: "GET /api/orders/{id}: load one order",
      input: "UUID id",
      output: "OrderResponse",
      errors: ["OrderNotFoundException"],
    },
  },
}).edges({ uses: () => [Orders.getOrder] }); // another package: through its dome (E3)
```

```ts
// nuhokai/web.ts: the package com.acme.shop.web
import { node } from "@nuhokai/world";
import { ApiExceptionHandler } from "./web/api-exception-handler.ts";
import { OrderController } from "./web/order-controller.ts";

export const Web = node({
  id: "<written by nuhokai new>",
  purpose: "The HTTP layer: controllers and the error mapping; no business rules.",
  status: "built",
  source: ["src/main/java/com/acme/shop/web/**"],
  children: { orderController: OrderController, apiExceptionHandler: ApiExceptionHandler },
  ports: (c) => ({ get: c.orderController.ports.get }), // used by SpringRouter (P7)
}).edges({});
```

```ts
// nuhokai/externals/spring-router.ts
import { node } from "@nuhokai/world";
import { Web } from "../web.ts";

export const SpringRouter = node({
  id: "<written by nuhokai new>",
  external: true,
  externalType: "caller",
  purpose: "Spring MVC's dispatcher: every HTTP request enters here and is handed to one controller method.",
  status: "built",
  source: [],
  ports: {
    getApiOrdersById: {
      kind: "call",
      transport: "http",
      purpose: "GET /api/orders/{id}: load one order",
      input: "path id",
      output: "200 OrderResponse",
      errors: ["404 order not found"],
    },
  },
}).edges({ uses: () => [Web.get] });
```

```ts
// nuhokai/orders/order-repository.ts: Spring Data interface (C4) that owns the entity from a data-only package (C3)
import { node } from "@nuhokai/world";
import { Postgres } from "../externals/postgres.ts";

/** extends JpaRepository<Order, UUID>. Also owns Order (com.acme.shop.entity). */
export const OrderRepository = node({
  id: "<written by nuhokai new>",
  purpose: "Stores and loads orders.",
  status: "built",
  group: "persistence",
  source: ["src/main/java/com/acme/shop/orders/OrderRepository.java", "src/main/java/com/acme/shop/entity/Order.java"],
  ports: { findById: { kind: "call", purpose: "Load one order", input: "order id", output: "Optional<Order>" } },
}).edges({ uses: () => [Postgres.query] });
```
