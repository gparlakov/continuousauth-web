import axios from 'axios';
import * as debug from 'debug';
import * as express from 'express';
import * as Joi from 'joi';

import { validate, hasAdminAccessToTargetRepo } from '../../helpers/_middleware';
import { createA } from '../../helpers/a';
import {
  Project,
  SlackResponderLinker,
  withTransaction,
  CircleCIRequesterConfig,
  TravisCIRequesterConfig,
  AzureDevOpsRequesterConfig,
} from '../../db/models';
import { getProjectFromIdAndCheckPermissions } from './_safe';
import { azureDevOpsReleaseSlug } from '../../../common/slugs';

const d = debug('cfa:server:api:project:config');
const a = createA(d);

export function configRoutes() {
  const router = express();

  router.post(
    '/:id/config/requesters/circleci',
    validate(
      {
        a,
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
        body: {
          accessToken: Joi.string()
            .min(1)
            .required(),
        },
      },
      async (req, res) => {
        const project = await getProjectFromIdAndCheckPermissions(req.params.id, req, res);
        if (!project) return;

        const response = await axios.get(
          `https://circleci.com/api/v1.1/project/github/${project.repoOwner}/${project.repoName}/checkout-key`,
          {
            auth: {
              username: req.body.accessToken,
              password: '',
            },
            validateStatus: () => true,
          },
        );

        if (response.status !== 200) {
          return res.status(401).json({
            error:
              'That token is not valid for the current project, or the repository is not configured on CircleCI',
          });
        }

        const newProject = await withTransaction(async t => {
          const config = await CircleCIRequesterConfig.create(
            {
              accessToken: req.body.accessToken,
            },
            {
              returning: true,
            },
          );
          await project.resetAllRequesters(t);
          project.requester_circleCI_id = config.id;
          await project.save({ transaction: t });
          return await Project.findByPk(project.id, {
            include: Project.allIncludes,
            transaction: t,
          });
        });

        res.json(newProject);
      },
    ),
  );

  router.post(
    `/:id/config/requesters/${azureDevOpsReleaseSlug}`,
    validate(
      {
        a,
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
        body: {
          organizationName: Joi.string()
            .min(1)
            .required(),
          projectName: Joi.string()
            .min(1)
            .required(),
          accessToken: Joi.string()
            .min(1)
            .required(),
        },
      },
      async (req, res) => {
        const project = await getProjectFromIdAndCheckPermissions(req.params.id, req, res);
        if (!project) return;
        const { organizationName, projectName, accessToken } = req.body;

        const response = await axios.get<{
          count: number;
          value: Array<{ name: string; [id: string]: any }>;
        }>(`https://dev.azure.com/${organizationName}/_apis/projects/`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`PAT:${accessToken}`).toString('base64')}`,
            'X-TFS-FedAuthRedirect': 'Suppress',
          },
          validateStatus: () => true,
        });

        if (response.status !== 200) {
          return res.status(401).json({
            error:
              'That token is not valid for the current project, or the project is not available',
          });
        }

        const projectNameNormalized = projectName.toLowerCase();

        if (!response.data.value.some(p => p.name.toLowerCase() === projectNameNormalized)) {
          // user has supplied a valid access token and a valid org name so is probaly not a bad actor, deserves a good error
          return res.status(401).json({
            error: `Seems that a project with name "${projectName}" does not exist in the organization "${organizationName}"`,
          });
        }

        const newProject = await withTransaction(async t => {
          const config = await AzureDevOpsRequesterConfig.create(
            {
              accessToken: req.body.accessToken,
              organizationName,
              projectName,
            },
            {
              returning: true,
            },
          );
          await project.resetAllRequesters(t);
          project.requester_AzureDevOps_id = config.id;
          await project.save({ transaction: t });
          return await Project.findByPk(project.id, {
            include: Project.allIncludes,
            transaction: t,
          });
        });

        res.json(newProject);
      },
    ),
  );

  router.post(
    '/:id/config/requesters/travisci',
    validate(
      {
        a,
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
        body: {
          accessToken: Joi.string()
            .min(1)
            .required(),
        },
      },
      async (req, res) => {
        const project = await getProjectFromIdAndCheckPermissions(req.params.id, req, res);
        if (!project) return;

        const response = await axios.get(
          `https://api.travis-ci.org/repo/${project.repoOwner}%2F${project.repoName}`,
          {
            headers: {
              'Travis-API-Version': '3',
              Authorization: `token ${req.body.accessToken}`,
            },
            validateStatus: () => true,
          },
        );

        if (response.status !== 200) {
          return res.status(401).json({
            error:
              'That token is not valid for the current project, or the repository is not configured on Travis CI',
          });
        }

        const newProject = await withTransaction(async t => {
          const config = await TravisCIRequesterConfig.create(
            {
              accessToken: req.body.accessToken,
            },
            {
              returning: true,
            },
          );
          await project.resetAllRequesters(t);
          project.requester_travisCI_id = config.id;
          await project.save({ transaction: t });
          return await Project.findByPk(project.id, {
            include: Project.allIncludes,
            transaction: t,
          });
        });

        res.json(newProject);
      },
    ),
  );

  router.post(
    '/:id/config/responders/slack',
    validate(
      {
        a,
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
      },
      async (req, res) => {
        const project = await getProjectFromIdAndCheckPermissions(req.params.id, req, res);
        if (!project) return;

        const linker = await withTransaction(async t => {
          await SlackResponderLinker.destroy({
            where: {
              projectId: project.id,
            },
            transaction: t,
          });
          return await SlackResponderLinker.create(
            {
              projectId: project.id,
            },
            {
              transaction: t,
              returning: true,
            },
          );
        });

        res.json({
          linker,
          slackClientId: process.env.SLACK_CLIENT_ID,
        });
      },
    ),
  );

  router.patch(
    '/:id/config/responders/slack',
    validate(
      {
        a,
        params: {
          id: Joi.number()
            .integer()
            .required(),
        },
        body: {
          usernameToMention: Joi.string()
            .min(1)
            .max(50)
            .required(),
        },
      },
      async (req, res) => {
        const project = await getProjectFromIdAndCheckPermissions(req.params.id, req, res);
        if (!project) return;

        if (!project.responder_slack) {
          return res.status(400).json({
            error: 'Project is not configured to use Slack as a responder',
          });
        }

        project.responder_slack.usernameToMention = req.body.usernameToMention;
        await project.responder_slack.save();

        res.json(project);
      },
    ),
  );

  return router;
}
