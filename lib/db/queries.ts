'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { generateUUID } from '@/lib/utils';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
  systemPrompt,
  type SystemPrompt
} from './schema';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);
const SYSTEM_PROMPT_ID = process.env.SYSTEM_PROMPT_ID

export async function getUserByEmail(email: string): Promise<Array<User>> {
  try {
    return await db
      .select()
      .from(user)
      .where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database', error);
    throw error;
  }
}

export async function getUserByVerificationToken(token: string) {
  try {
    return db
      .select()
      .from(user)
      .where(eq(user.emailVerificationToken, token))
      .limit(1)
      .then(res => res[0]);;
  } catch (error) {
    console.error('Failed to get user from database', error);
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  try {
    return await db
      .insert(user)
      .values({ email, password: hash });
  } catch (error) {
    console.error('Failed to create user in database', error);
    throw error;
  }
}

export async function generateVerificationToken(userId: string) {
  const token = generateUUID();
  await db
    .update(user)
    .set({ emailVerificationToken: token })
    .where(eq(user.id, userId));
  return token;
}

export async function updateUserVerificationStatus(userId: string, isVerified: boolean) {
  await db
    .update(user)
    .set({ emailVerified: isVerified, emailVerificationToken: null })
    .where(eq(user.id, userId));
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
    });
  } catch (error) {
    console.error('Failed to save chat in database', error);
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database', error);
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('Failed to get chats by user from database', error);
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database', error);
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  content,
  userId,
}: {
  id: string;
  title: string;
  content: string;
  userId: string;
}) {
  try {
    return await db.insert(document).values({
      id,
      title,
      content,
      userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save document in database', error);
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database', error);
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database', error);
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database', error);
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

async function initializeSystemPrompt(): Promise<SystemPrompt> {
  const defaultContent = { message: 'Default system prompt' }; // Customize as needed

  try {
    if (!SYSTEM_PROMPT_ID) {
      throw new Error("SYSTEM_PROMPT_ID must be defined");
    }

    const [newPrompt] = await db
      .insert(systemPrompt)
      .values({
        id: SYSTEM_PROMPT_ID,
        content: defaultContent,
      })
      .returning(); // Return the inserted record

    return newPrompt;
  } catch (error) {
    console.error('Failed to initialize SystemPrompt in database', error);
    throw error;
  }
}

export async function getSystemPrompt(): Promise<SystemPrompt> {
  try {
    if (!SYSTEM_PROMPT_ID) {
      throw new Error("SYSTEM_PROMPT_ID must be defined");
    }

    // Try to fetch the existing SystemPrompt with the specified ID
    const [existingPrompt] = await db
      .select()
      .from(systemPrompt)
      .where(eq(systemPrompt.id, SYSTEM_PROMPT_ID));

    if (existingPrompt) {
      return existingPrompt;
    }

    // If no record exists, call initializeSystemPrompt to create it
    return await initializeSystemPrompt();
  } catch (error) {
    console.error('Failed to retrieve or create the SystemPrompt in database', error);
    throw error;
  }
}

export async function updateSystemPrompt(newContent: any): Promise<SystemPrompt> {
  try {
    if (!SYSTEM_PROMPT_ID) {
      throw new Error("SYSTEM_PROMPT_ID must be defined");
    }

    const [updatedPrompt] = await db
      .update(systemPrompt)
      .set({ content: newContent })
      .where(eq(systemPrompt.id, SYSTEM_PROMPT_ID))
      .returning(); // Return the updated record

    if (!updatedPrompt) {
      throw new Error('SystemPrompt not found for update');
    }

    return updatedPrompt;
  } catch (error) {
    console.error('Failed to update SystemPrompt content in database', error);
    throw error;
  }
}
