CREATE TABLE IF NOT EXISTS governance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  entity_type varchar(64) NOT NULL,
  action_type varchar(64) NOT NULL,
  threshold_amount numeric(18,2),
  threshold_pct numeric(10,4),
  approval_steps_json jsonb NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS gov_policies_company_branch_entity_action_idx
  ON governance_policies (company_id, branch_id, entity_type, action_type);
CREATE INDEX IF NOT EXISTS gov_policies_enabled_idx
  ON governance_policies (is_enabled);

CREATE TABLE IF NOT EXISTS governance_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  entity_type varchar(64) NOT NULL,
  entity_id uuid NOT NULL,
  action_type varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reason varchar(1024),
  meta_json jsonb,
  CONSTRAINT gov_approval_requests_status_chk CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS gov_approval_requests_scope_idx
  ON governance_approval_requests (company_id, branch_id, entity_type, action_type);
CREATE INDEX IF NOT EXISTS gov_approval_requests_status_idx
  ON governance_approval_requests (status);
CREATE INDEX IF NOT EXISTS gov_approval_requests_entity_idx
  ON governance_approval_requests (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS governance_approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz,
  approval_request_id uuid NOT NULL REFERENCES governance_approval_requests(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  required_role varchar(64),
  required_permission varchar(128),
  status varchar(16) NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_reason varchar(1024),
  CONSTRAINT gov_approval_steps_status_chk CHECK (status IN ('pending', 'approved', 'rejected', 'skipped'))
);

CREATE INDEX IF NOT EXISTS gov_approval_steps_request_order_idx
  ON governance_approval_steps (approval_request_id, step_order);
CREATE INDEX IF NOT EXISTS gov_approval_steps_status_idx
  ON governance_approval_steps (status);

CREATE TABLE IF NOT EXISTS governance_approvals_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES governance_approval_requests(id) ON DELETE CASCADE,
  event_type varchar(64) NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  payload_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gov_approvals_audit_request_idx
  ON governance_approvals_audit (approval_request_id, created_at);
CREATE INDEX IF NOT EXISTS gov_approvals_audit_event_idx
  ON governance_approvals_audit (event_type);
