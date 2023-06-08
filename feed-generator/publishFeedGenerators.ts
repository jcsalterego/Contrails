import dotenv from 'dotenv'
import { AtpAgent, BlobRef } from '@atproto/api'
import fs from 'fs/promises'
import path from 'path'

const publishAll = async () => {
  dotenv.config()

  // login
  const handle = `${process.env.BLUESKY_HANDLE}`
  const password = `${process.env.BLUESKY_APP_PASSWORD}`
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  try {
    await agent.api.app.bsky.feed.describeFeedGenerator()
  } catch (err) {
    throw new Error(
      'The bluesky server is not ready to accept published custom feeds yet',
    )
  }

  let configs = require("./configs.json")
  for (let configName in configs) {
    let config = configs[configName]
    await publishSingle(agent, configName, config)
  }
}

const publishSingle = async (agent: AtpAgent, configName: string, config: any) => {
  const recordName = config.recordName
  const displayName = config.displayName
  const description = config.description
  const avatar: string = config.avatar
  const isEnabled = config.isEnabled

  if (isEnabled === false) {
    console.log(`Skipping ${recordName} because isEnabled is set to false`)
    return
  }

  const feedGenDid = `did:web:${process.env.FEEDGEN_HOSTNAME}`

  let avatarRef: BlobRef | undefined
  if (avatar) {
    let encoding: string
    if (avatar.endsWith('png')) {
      encoding = 'image/png'
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg'
    } else {
      throw new Error('expected png or jpeg')
    }
    const img = await fs.readFile(path.join('..', avatar))
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    })
    avatarRef = blobRes.data.blob
  }

  let record = {
    repo: agent.session?.did ?? '',
    collection: 'app.bsky.feed.generator',
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
    },
  }
  console.log(JSON.stringify(record, null, 2))
  await agent.api.com.atproto.repo.putRecord(record)
  console.log('All done 🎉')
}

publishAll()
