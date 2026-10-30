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

Run `nuhokai init` in the project directory, then read `nuhokai/.generated/world/index.d.ts`. It holds the format's
types and their docs, and it wins over anything in this prompt. The essentials:

- `node({ id, purpose, status, source, ports?, children?, implements?, abstract?, external?, externalType?, group?,
  requirements?, testCases?, decisions? }).edges({ uses?: () => [...] })`. `.edges()` is required, also as
  `.edges({})`.
- A **leaf** declares its own `ports` (`{ name: { kind: "call", purpose, input?, output?, errors?, transport? } }` or
  `{ kind: "event", purpose, payload? }`) and may have `uses` edges to other nodes' ports.
- A **dome** has `children: { name: Node }` and `ports: (c) => ({ name: c.child.ports.port })`. It has no `uses` of its
  own and declares no port shapes.
- An **abstract** node is a contract: its ports are inherited by every node that `implements` it, never redeclared.
  It has no `uses`, no `implements` and no children.
- An **external** node is not built by us: top level only, no children, `source: []`, `externalType` `"caller"`,
  `"api"` or `"db"`.
- `tbd.call({ description })` / `tbd.event({ description })` is a placeholder for a dependency whose target is unknown.
- World files are declarative: they import only `@nuhokai/world` and other world files, call only the format's
  functions, and have no casts except `as const`, no `!`, no `any` and no `@ts-` directives. Node files never import
  `nuhokai/index.ts`.

## 1. Inventory before writing anything

Read the whole of `src/main/java` (and `src/main/resources/application*.{yml,yaml,properties}`). Build an inventory
and write it to `nuhokai/inventory.md` as one table row per type: fully qualified name, kind (class,
interface, enum, record, annotation), Spring stereotype, the node it will become, its node file, its parent (top level
or `SpringRouter`), and its outgoing dependencies. List separately:

- every HTTP entry point: HTTP method, full path (class-level `@RequestMapping` prefix plus method mapping, with
  `server.servlet.context-path` and `spring.mvc.servlet.path` applied), handler class and method, request body,
  path and query parameters, response type and status, mapped errors;
- every other entry point: `@Scheduled`, `@KafkaListener`, `@RabbitListener`, `@JmsListener`, `@SqsListener`,
  `@EventListener`, `@TransactionalEventListener`, `CommandLineRunner`, `ApplicationRunner`;
- every external system: datasources, caches, brokers, outbound HTTP clients (`@FeignClient`, `RestTemplate`,
  `RestClient`, `WebClient`, `@HttpExchange`), with the configuration key that names each.

Only then write node files. Do not skip the inventory; it is how you make sure no class and no endpoint is missed.

## 2. Mapping rules

### Nodes

- **N1. Every top-level type in `src/main/java` becomes exactly one node**: classes, abstract classes, interfaces,
  enums, records. Nested, inner, local and anonymous types are part of their enclosing type's node, never their own
  (they share its file, and a file has one owner).
- **N2. Not nodes:** `src/test/**` (see T1), generated sources (`target/`, `build/`, MapStruct/Lombok/QueryDSL/OpenAPI
  output), `package-info.java`, `module-info.java`.
- **N3. Interfaces with at least one implementing class in the project** become abstract contract nodes; each
  implementor `implements` them. Interfaces with no implementing class (Spring Data repositories, `@FeignClient`,
  `@HttpExchange`, projections) become ordinary leaves, because Spring generates their implementation. Abstract
  classes are ordinary leaves; name the base class in a subclass's `purpose`.
- **N4. Name:** the export name is the class's simple name (`OrderService`). If two classes share a simple name,
  prefix the one further from the base package with its package segment in PascalCase (`BillingMapper`,
  `ShippingMapper`). Note any renamed class in the file's doc comment.
- **N5. File:** `nuhokai/<package path below the base package, kebab-case>/<class name, kebab-case>.ts`, created with
  `nuhokai new <that path>`, e.g. `com.acme.shop.orders.OrderService` → `nuhokai new orders/order-service`.
  `nuhokai new` writes a fresh id; never write ids by hand and never reuse one.
- **N6. Source:** a class node's `source` is exactly its own `.java` file, e.g.
  `["src/main/java/com/acme/shop/orders/OrderService.java"]`. The world's `source` is `["src/main/java/**"]`.
- **N7. Status:** every node that exists in code is `"built"`; code marked `@Deprecated` is `"deprecated"`. Externals
  are `"built"` with `source: []`.
- **N8. Group:** set `group` to the class's top-level feature package below the base package (`orders`, `billing`), so
  the map stacks a feature's islands together. Leave it out for classes directly in the base package.
- **N9. The `@SpringBootApplication` class** is a node like any other; its `purpose` says it boots the application.

### HTTP entry points and the SpringRouter

- **H1. One dome, `SpringRouter`, owns the whole HTTP surface**, in `nuhokai/spring-router.ts`, at the top level. Its
  children are every `@RestController` and `@Controller` class, plus the web-only classes that serve them:
  `@ControllerAdvice` / `@RestControllerAdvice`, `HandlerInterceptor`s, servlet `Filter`s and `WebMvcConfigurer`s.
  These children are not listed in `index.ts`; `SpringRouter` lists them.
- **H2. Every handler method is one port on its controller node**: `kind: "call"`, `transport: "http"`, named after
  the Java method (overloads get a suffix). `purpose` starts with the HTTP method and full path
  (`"GET /api/orders/{id}: load one order"`); `input` names the body type and path/query parameters; `output` names the
  success status and response type (`"200 OrderResponse"`); `errors` lists each status the endpoint can answer with
  and why (`"404 order not found"`), from `@ResponseStatus`, `ResponseStatusException`, `ResponseEntity` branches and
  the `@ControllerAdvice` mappings for the exceptions the call path throws. `@Valid` bodies add `"400 invalid
  request"`. A streamed or SSE response says so in `output`.
- **H3. `SpringRouter` exposes every HTTP port**, named `<method><Path>` in camelCase, path variables as `By<Var>`:
  `POST /api/orders` → `postApiOrders`, `GET /api/orders/{id}` → `getApiOrdersById`. One router port per handler
  method; a method mapped to several paths or verbs is exposed under the first and the others listed in its
  `purpose`. If two names collide, append the controller's name.
- **H4. Its source is the list of its children's files**, so `nuhokai check` sees it as built code.
- **H5. Callers of the API** are one external node, `HttpClient` (`externalType: "caller"`, in
  `nuhokai/externals/http-client.ts`), that `uses` every `SpringRouter` port. If the project shows distinct callers
  (a frontend, a partner, an admin UI, by path prefix or security rule), make one caller node each and split the
  ports between them.
- **H6. Spring Security** configuration (`SecurityFilterChain` beans, `@EnableWebSecurity`) stays a normal top-level
  node; `@PreAuthorize` / `@Secured` rules and the filter chain's path rules go into each affected endpoint as a
  `constraint` requirement on the controller (`"Requires role ADMIN"`).

### Ports of non-HTTP nodes

- **P1. Services and components** (`@Service`, `@Component`, plain classes): one `call` port per public method another
  node calls, named after the method. Leave out getters, setters, `equals`, `hashCode`, `toString`, builders and
  methods nobody outside the class calls.
- **P2. Repositories:** one port per repository method another node calls, including inherited ones such as `save`
  and `findById`.
- **P3. Data types** (`@Entity`, `@Embeddable`, records, DTOs, value objects, enums, exceptions) have no ports: they
  are data and appear by name in other ports' shapes. Exception: an entity or value object with business methods
  other nodes call gets ports for those methods (P1).
- **P4. Contracts:** an abstract node's ports are its interface's methods; implementors do not redeclare them and
  only add ports for their extra public methods.
- **P5. Shapes are prose that names the Java types**: `input: "PlaceOrderCommand (customer id, lines)"`,
  `output: "Optional<Order>"`, `errors: ["OrderNotFoundException"]`. Every checked exception and every unchecked
  exception the method deliberately throws belongs in `errors`.
- **P6. Events:** `ApplicationEventPublisher.publishEvent(X)` gives the publisher an `event` port named after `X`
  (`orderPlaced`, `payload: "OrderPlacedEvent"`); every `@EventListener` / `@TransactionalEventListener` for `X`
  `uses` that port. If several classes publish `X`, each gets the port.
- **P7. Other entry points:** `@Scheduled` methods are `call` ports with the schedule in `purpose`, used by one external
  `Scheduler` caller node. Message listeners `uses` an `event` port on the broker's external node, one per topic or
  queue (`ordersTopic`); producers (`KafkaTemplate.send` and friends) `uses` a `call` port on it (`publishOrdersTopic`).

### Edges

- **E1. A `uses` edge exists for every call or event subscription from one node to another**, pointing at exactly the
  ports used. Find them from the injected dependencies (constructor parameters, `@Autowired`/`@Inject`
  fields and setters, `@Bean` method parameters) and the methods actually called on them. A dependency that is
  injected but never called gives no edge.
- **E2. The edge follows the declared type:** a field typed as an interface uses the contract's port
  (`PaymentGateway.charge`), not an implementor's. A field typed as a concrete class uses that class's port. Calling
  an inherited port on an implementor is `inherited(Implementor, Contract.port)`.
- **E3. Calls inside one class**, and calls to data types' getters, are not edges.
- **E4. Static utility calls** to a project class are edges to a port on that class.
- **E5. A dependency you cannot resolve** (reflection, `ApplicationContext.getBean`, a dynamic qualifier, a call
  through a generic handler map) is a `tbd.call` / `tbd.event` with a description of what is called and why it is
  unresolved, declared in `nuhokai/holes.ts` and exported. Never guess a target.
- **E6. Scope:** `uses` may only target a sibling or a sibling of an ancestor. Controllers inside `SpringRouter` may
  use any top-level node; a top-level node must never use a controller directly, only a `SpringRouter` port.

### Externals

- **X1. One external node per external system**, top level, in `nuhokai/externals/`: each datasource (`db`, named
  after the product and database, `OrdersPostgres`), cache (`db`), broker (`api`), and outbound HTTP API (`api`,
  named after the service). Its ports are only the operations the project uses: a datasource has `query` with
  `transport: "jdbc"` (or `"r2dbc"`, `"mongodb"`, …), an HTTP API has one port per endpoint called with
  `transport: "http"` and method and path in `purpose`.
- **X2. Feign / `@HttpExchange` interfaces** are project nodes (N3) that `uses` the external API's ports;
  `RestTemplate`/`WebClient` callers use the external API's ports directly.
- **X3. Repositories, `JdbcTemplate` and `EntityManager` users** `uses` the datasource's `query` port. JPA entities
  do not.

### Specs: requirements, test cases, decisions

- **T1. Test cases come from tests:** for each JUnit test that targets a node, add one `testCases` entry to that node:
  what is done and what is expected, in one plain sentence (use `@DisplayName` if present). Integration tests
  (`@SpringBootTest`, `@WebMvcTest`) belong to the node they enter through, usually a controller.
- **T2. Requirements come from code, never from imagination:** Bean Validation on request types, `@PreAuthorize`,
  `@Transactional` boundaries, idempotency and uniqueness checks become requirements (`constraint` where they guard
  how, not what). If a node has no evident requirement, leave `requirements` out.
- **T3. Decisions** only when the code or the repository documents one (ADRs, README, a comment explaining why).
  Otherwise leave `decisions` out.
- **T4. Purpose:** one or two sentences: what the node owns and what it deliberately does not do, from the class's
  Javadoc and its code. If you are not sure, write the best reading and end it with `(unverified)`.

## 3. The world file

`nuhokai/index.ts` sets `name`, a one-sentence `description`, `source: ["src/main/java/**"]`, and lists every
top-level node: `SpringRouter`, every non-web class, every contract, every external. A node listed there must not also
be a child; a child must not also be listed there.

## 4. Check, then map

Run `nuhokai check` and fix every error and warning (orphans are nodes you forgot to list) until it prints nothing and
exits 0. Fix the world, never the Java. Then run `nuhokai map` to write `nuhokai/.generated/map.html`.

## 5. Report

Finish with:

1. counts: classes in the inventory vs. nodes written (they must match, minus nested types), HTTP endpoints vs.
   `SpringRouter` ports (they must match);
2. every `tbd` placeholder and why it is unresolved;
3. every `(unverified)` purpose and every renamed class;
4. anything you could not map with these rules, and what you did instead.

## Example

```ts
// nuhokai/web/order-controller.ts
import { node } from "@nuhokai/world";
import { OrderService } from "../orders/order-service.ts";

/** @RestController @RequestMapping("/api/orders") */
export const OrderController = node({
  id: "<written by nuhokai new>",
  purpose: "Translates the orders HTTP API to OrderService calls; holds no business rules.",
  status: "built",
  group: "web",
  source: ["src/main/java/com/acme/shop/web/OrderController.java"],
  ports: {
    create: {
      kind: "call",
      transport: "http",
      purpose: "POST /api/orders: place an order",
      input: "CreateOrderRequest (JSON body)",
      output: "201 OrderResponse",
      errors: ["400 invalid request", "402 payment declined"],
    },
    get: {
      kind: "call",
      transport: "http",
      purpose: "GET /api/orders/{id}: load one order",
      input: "path id",
      output: "200 OrderResponse",
      errors: ["404 order not found"],
    },
  },
}).edges({ uses: () => [OrderService.placeOrder, OrderService.getOrder] });
```

```ts
// nuhokai/spring-router.ts
import { node } from "@nuhokai/world";
import { ApiExceptionHandler } from "./web/api-exception-handler.ts";
import { OrderController } from "./web/order-controller.ts";

/** Every HTTP entry point of the application, one port per handler method. */
export const SpringRouter = node({
  id: "<written by nuhokai new>",
  purpose: "The application's HTTP surface: Spring MVC dispatches each request to one controller method.",
  status: "built",
  source: [
    "src/main/java/com/acme/shop/web/OrderController.java",
    "src/main/java/com/acme/shop/web/ApiExceptionHandler.java",
  ],
  children: { orderController: OrderController, apiExceptionHandler: ApiExceptionHandler },
  ports: (c) => ({
    postApiOrders: c.orderController.ports.create,
    getApiOrdersById: c.orderController.ports.get,
  }),
}).edges({});
```

```ts
// nuhokai/orders/stripe-payment-gateway.ts: an implementor of the PaymentGateway interface (N3, P4)
import { node } from "@nuhokai/world";
import { Stripe } from "../externals/stripe.ts";
import { PaymentGateway } from "./payment-gateway.ts";

export const StripePaymentGateway = node({
  id: "<written by nuhokai new>",
  purpose: "PaymentGateway on Stripe; does not decide when to charge.",
  status: "built",
  group: "orders",
  source: ["src/main/java/com/acme/shop/orders/StripePaymentGateway.java"],
  implements: () => [PaymentGateway],
}).edges({ uses: () => [Stripe.createCharge] });
```
