# GitHub repository collaboration

## Purpose
Describe which GitHub resources callers can read and what the plugin checks before forwarding collaboration requests.

<!-- Last verified: d35de7c2, 2026-11-22; plugin sources clean. -->
<!-- uncertainty: No live GitHub responses or successful mutations were verified. -->
<!-- deferred: plugins/gh/src/gh/{createIssue,createPr,updateIssue,updatePr,requestReviewers,merge}.ts payload details. -->

## Requirements

### Requirement: Repository lookup
The repository helper SHALL return the GitHub repository resource selected by owner and name.

#### Scenario: Named repository
- **WHEN** the caller supplies an owner and repository name
- **THEN** the helper returns the result of GET `/repos/{owner}/{repo}` without projecting fields

<!-- id: gh-repo-get -->
<!-- entities: repository -->
<!-- enforced: plugins/gh/src/gh/repo.ts default export -->

### Requirement: Issue and pull request lists
List helpers SHALL request one page of the selected resource, defaulting to open entries and a page size of 30.

#### Scenario: Issue labels
- **WHEN** a caller lists closed issues with a nonempty labels filter
- **THEN** the issues request includes both filters and returns the page without removing pull requests

#### Scenario: Pull request list
- **WHEN** a caller lists pull requests without filters
- **THEN** the pulls request selects open entries and requests 30 results

<!-- id: gh-issues-prs-list -->
<!-- entities: issue, pull request -->
<!-- enforced: plugins/gh/src/gh/issues.ts default export; plugins/gh/src/gh/prs.ts default export -->

### Requirement: Optional detail collections
Numbered lookups SHALL return the issue or pull request and fetch only the related collections requested, using one page of size 100 per collection.

#### Scenario: Issue discussion
- **WHEN** comments are requested for an issue
- **THEN** the result's `comments` field contains the fetched comments page instead of the original field

#### Scenario: Reviews without files
- **WHEN** reviews but not files are requested for a pull request
- **THEN** the helper attaches the reviews page without fetching changed files

<!-- id: gh-pr-issue-related -->
<!-- entities: issue, pull request, comment, review -->
<!-- enforced: plugins/gh/src/gh/issue.ts default export; plugins/gh/src/gh/pr.ts default export -->

### Requirement: Search results
Search SHALL forward the query to the selected GitHub search collection and return the response envelope rather than only its items.

#### Scenario: Default search
- **WHEN** only a query is supplied
- **THEN** the helper requests `/search/issues` with that query and a page size of 30

<!-- id: gh-search-kind -->
<!-- entities: search query, result envelope -->
<!-- enforced: plugins/gh/src/gh/search.ts default export -->

### Requirement: REST request guard
The REST helper SHALL reject malformed routes and require the literal boolean `true` for methods other than GET and HEAD before obtaining credentials.

#### Scenario: Unconfirmed deletion
- **WHEN** a DELETE route is supplied without confirmation
- **THEN** the call fails before authentication and requests `confirm: true`

#### Scenario: Absolute URL as route operand
- **WHEN** the caller supplies `GET https://example.com`
- **THEN** the helper rejects the route format before authentication

<!-- id: gh-api-route-confirm -->
<!-- kind: invariant -->
<!-- entities: REST route, confirmation flag -->
<!-- enforced: plugins/gh/src/gh/api.ts default export -->
<!-- test: plugins/gh/src/gh/writeGuard.test.ts :: GitHub write guards :: low-level non-GET requires confirmation before auth -->
<!-- test: plugins/gh/src/gh/writeGuard.test.ts :: GitHub write guards :: route validation rejects external URLs -->

### Requirement: Collaboration write guards
Mutation helpers SHALL reject otherwise valid calls without `confirm: true`. The flag is a caller assertion, not proof of protected human approval.

#### Scenario: Missing confirmation
- **WHEN** confirmation is omitted for a comment, issue or pull request creation or update, reviewer request, review submission, or merge
- **THEN** the helper rejects the call rather than dispatching the mutation

<!-- id: gh-comment-confirm -->
<!-- kind: invariant -->
<!-- entities: mutation, confirmation flag -->
<!-- enforced: plugins/gh/src/gh/comment.ts default export; plugins/gh/src/gh/review.ts default export; plugins/gh/src/gh/writeGuard.test.ts GitHub write guards -->
<!-- test: plugins/gh/src/gh/writeGuard.test.ts :: GitHub write guards :: comment requires confirmation -->
<!-- test: plugins/gh/src/gh/writeGuard.test.ts :: GitHub write guards :: createIssue requires confirmation -->
<!-- test: plugins/gh/src/gh/writeGuard.test.ts :: GitHub write guards :: all additional write helpers require confirmation -->

### Requirement: Review content
The review helper SHALL accept only APPROVE, REQUEST_CHANGES and COMMENT events and require a nonempty body or inline comments for the latter two.

#### Scenario: Empty change request
- **WHEN** REQUEST_CHANGES has neither a body nor inline comments, even with confirmation
- **THEN** the helper rejects the review before dispatch

#### Scenario: Inline comment without a side
- **WHEN** a confirmed valid review contains an inline comment with no side
- **THEN** the review request sends that comment with side `RIGHT`

<!-- id: gh-review-event -->
<!-- entities: review, inline comment -->
<!-- enforced: plugins/gh/src/gh/review.ts default export -->
