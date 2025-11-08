import React from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import Post from '../components/Post.jsx';

/**
 * Home — clean Insta-style feed layout
 * - Centered feed (like Instagram’s main column)
 * - Smooth fade-in for posts
 * - Scales gracefully on all screens
 * - Keeps your original logic intact
 */
export default function Home({ showToast }) {
  const posts = [
    {
      id: 1,
      author: 'Nina Artist',
      time: '3h',
      caption: 'Sunset walk — wonderful evening!',
      avatar: 'https://i.pravatar.cc/56?img=12',
      initialComments: [{ id: 101, author: 'Sam', text: 'Beautiful!' }],
    },
    {
      id: 2,
      author: 'Sam Runner',
      time: '6h',
      caption: 'New shoes, new goals. Time to test the moderation.',
      avatar: 'https://i.pravatar.cc/56?img=32',
      initialComments: [],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-xl px-2 sm:px-0 py-6 space-y-8">
      <AnimatePosts posts={posts} showToast={showToast} />
    </main>
  );
}

/** Adds staggered motion to post list */
function AnimatePosts({ posts, showToast }) {
  return (
    <div className="flex flex-col gap-8">
      {posts.map((post, i) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
        >
          <Post post={post} showToast={showToast} />
        </motion.div>
      ))}
    </div>
  );
}
