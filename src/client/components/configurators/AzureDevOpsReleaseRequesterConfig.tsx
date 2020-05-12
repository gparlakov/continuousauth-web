import * as React from 'react';
import { Heading, Paragraph, Pane, TextInput, Button, Label, toaster } from 'evergreen-ui';

import { FullProject } from '../../../common/types';
import { useAsyncTaskFetch } from 'react-hooks-async';
import { azureDevOpsReleaseSlug } from '../../../common/slugs';
import { defaultBodyReader } from '../../utils';

export interface Props {
  project: FullProject;
  setProject: (newProject: FullProject) => void;
}

export function AzureDevOpsReleaseRequesterConfig(props: Props) {
  const slug = azureDevOpsReleaseSlug;
  const requesterName = 'Azure Dev Ops (Release)';

  const { project, setProject } = props;
  const azdo = project.requester_AzureDevOps;
  const originalAccessToken = azdo ? azdo.accessToken : '';
  const originalOrganizationName = azdo ? azdo.organizationName : '';
  const originalProjectName = azdo ? azdo.projectName : '';

  const [accessToken, setAccesToken] = React.useState(originalAccessToken);
  const [organizationName, setOrganizationName] = React.useState(originalOrganizationName);
  const [projectName, setProjectName] = React.useState(originalProjectName);

  const options = React.useMemo(
    () => ({
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ accessToken, projectName, organizationName }),
    }),
    [project, accessToken, projectName, organizationName],
  );

  const createRequesterTask = useAsyncTaskFetch<FullProject>(
    `/api/project/${project.id}/config/requesters/${slug}`,
    options,
    defaultBodyReader,
  );

  React.useEffect(() => {
    if (createRequesterTask.error) {
      const { responseBody } = createRequesterTask.error as any;
      let errorInfo =
        'Please ensure the access token is correct for this project and organiztion and try again.';
      if (
        responseBody != null &&
        responseBody.error != null &&
        typeof responseBody.error === 'string' &&
        responseBody.error.length > 0
      ) {
        errorInfo = responseBody.error;
      }
      toaster.danger(`Failed to create the ${requesterName} Requester. ${errorInfo}`);
    }
  }, [createRequesterTask.error]);

  React.useEffect(() => {
    if (createRequesterTask.result) {
      toaster.success(
        `Successfully created the ${requesterName} Requester. The access token/project/organizationName combination is valid.`,
      );
      setProject(createRequesterTask.result);
    }
  }, [createRequesterTask.result]);

  const hasChanged = () =>
    (accessToken !== originalAccessToken && accessToken) ||
    (organizationName !== originalOrganizationName && organizationName) ||
    (projectName !== originalProjectName && projectName);

  const saving = createRequesterTask.started && createRequesterTask.pending;
  return (
    <Pane>
      <Pane>
        <Heading size={400} marginBottom={8}>
          {requesterName}
        </Heading>
        <Paragraph marginBottom={4}>
          See example in{' '}
          <a
            href="https://github.com/continuousauth/web/blob/master/docs/azdo-props.png"
            target="_blank"
            rel="noreferrer noopener"
          >
            docs
          </a>
        </Paragraph>
        <Paragraph marginBottom={4}>
          <Label> Organization Name</Label>
        </Paragraph>
        <Paragraph marginBottom={4}>
          <TextInput
            value={organizationName}
            type="text"
            onChange={e => setOrganizationName(e.currentTarget.value)}
            disabled={saving}
          />
        </Paragraph>
        <Paragraph marginBottom={4}>
          <Label> Project Name</Label>
        </Paragraph>
        <Paragraph marginBottom={4}>
          <TextInput
            value={projectName}
            type="text"
            onChange={e => setProjectName(e.currentTarget.value)}
            disabled={saving}
          />
        </Paragraph>
        <Paragraph marginBottom={4}>
          <Label>Personal Access Token</Label>
        </Paragraph>
        <TextInput
          value={accessToken}
          type="password"
          onChange={e => setAccesToken(e.currentTarget.value)}
          disabled={saving}
        />
        {hasChanged() ? (
          <Button
            appearance="primary"
            intent="success"
            marginLeft={8}
            isLoading={saving}
            disabled={createRequesterTask.error}
            onClick={() => createRequesterTask.start()}
          >
            Save
          </Button>
        ) : null}
      </Pane>
    </Pane>
  );
}
