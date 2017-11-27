# kafka-cache
Explorations for the log-backed in-memory cache we need in almost every service

## Sample data model

All `ID`s are UUIDs.

```graphql
type User {
  id: ID!
  email: String
  displayName: String!
  groups: [Organization]!
}
```


```graphql
type Organization {
  id: ID!
  name: String!
}
```

```graphql
enum SessionType {
  REGULAR
  MEETINGSCREEN
}
```

```graphql
type Session {
  id: ID!
  user: User!
  type: SessionType!
  ipAddress: String
}
```
