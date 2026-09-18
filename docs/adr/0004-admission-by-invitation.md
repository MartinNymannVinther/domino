# ADR 0004: Admission by application and invitation

Status: accepted · Date: 2026-09-03 (inherited from Haij, ADR 0013 there)

A public repository and a closed installation need a front door that is
not a "no": a way to ask, a way for the owner to say yes with one click,
and a way in that admits exactly the person who was approved. Domino ships
with that door from its first commit, because the plan is to let
colleagues, partners and customers in one at a time before there is any
hosted signup.

## The shape of it

Someone applies at `/register` with name, e-mail, organisation and a line
about the project; that stores a request and nothing else. The
installation's owner approves it, which mints a single-use key for that
address. The person opens the link, the registration form is locked to
the approved address and workspace name, and the key is spent the moment
the account exists. The owner can also invite an address directly, and
can mint a fresh key for an address at any time, which retires the old
one.

## The key is the whole privilege, so it is treated like one

The token is 256 random bits, stored only as a sha256 hash, valid for
seven days, usable once, and bound to an e-mail address. A leaked
database yields no usable key; a leaked link is dead after its first use
or after a week, and cannot be used to register under a different
address. The plain token is shown to the owner exactly once, right after
it is minted, because nothing else has it: "show the link again" is
deliberately impossible, and "new link" is the honest alternative.

Trade-off accepted: an owner who closes the page before copying the link
has to mint another. That is a small, visible cost for never having a
plain credential in the database.

## The gate stays the gate

Signup has one door (`signupAllowed`), enforced inside Better Auth's
request hook and not only in the form. An invitation is one more reason
for that door to open and changes nothing else about it: `SIGNUP=closed`
remains the default, the empty-installation exception remains, and a
direct call to the sign-up endpoint without a valid key is refused
exactly as before. The key reaches the hook as a request header set by
our own server code; a browser calling the endpoint by hand gains nothing
by adding one it does not have.

## Who may approve

`users.platform_role`, with one value, `owner`. It is set on the first
user of an empty installation, at the moment of creation, so it holds for
every path that can create a user. It is declared to Better Auth with
`input: false`, so no request body can carry it, and it is read from the
database on every check, so revoking it takes effect immediately. It is
not a workspace role: it says who may admit new workspaces to the
installation, nothing more.

Trade-off accepted: no interface for granting the role. It is one script
(`scripts/grant-owner.ts`) or one SQL statement as the migration role, and
an interface for it would be a second thing to secure for a right that
changes hands about as often as the server does.

## The tables belong to the installation, not to a tenant

`access_requests` and `access_invitations` have no `org_id`; they describe
people who are not users yet. They are handled like the auth tables: the
auth role has them in full, the application role has no grant at all, and
a test proves the application role is refused with or without a tenant
context. The tenancy checklist asks for an RLS policy and an isolation
test on every new table; here the isolation is total, which is the
strongest form of the same rule. The audit trigger keys on `org_id`, so
the admission events are written explicitly instead: `access.requested`,
`access.approved`, `access.declined`, `invitation.created`,
`invitation.used`, with the actor where there is one.

## Things the form does on purpose

A second application from an address with one pending is answered exactly
like the first and stores nothing, so the answer reveals nothing about
who has applied. A filled honeypot field gets the same answer and leaves
no trace. More than five applications an hour from one address are
refused. A request holds personal data about a non-user, so it holds the
minimum that lets the owner decide, and says so on the form.

## Deliberately not built

Mail. Domino has no mail adapter yet, so the owner sends the link. When the
adapter lands (an EU provider, behind an adapter), the approve step sends
it and this page stops being the last mile; nothing in the data model
changes.

Inviting colleagues into an existing workspace. That is membership,
Better Auth's organization invitations, and a different feature with a
different audience; it arrives with people as identities in wave 2.

Automatic deletion of declined and expired requests. They are personal
data about people who never became users, and the right retention is a
GDPR decision to make once rather than a default to guess at now; the
record of processing gets an entry when it is made.
