/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use api::{ApiMsg, FrameMsg, SceneMsg, TransactionMsg};
use bincode::serialize;
use byteorder::{LittleEndian, WriteBytesExt};
use std::any::TypeId;
use std::fmt::Debug;
use std::fs::File;
use std::io::Write;
use std::mem;
use std::path::PathBuf;

pub static WEBRENDER_RECORDING_HEADER: u64 = 0xbeefbeefbeefbe01u64;

pub trait ApiRecordingReceiver: Send + Debug {
    fn write_msg(&mut self, frame: u32, msg: &ApiMsg);
    fn write_payload(&mut self, frame: u32, data: &[u8]);
}

#[derive(Debug)]
pub struct BinaryRecorder {
    file: File,
}

impl BinaryRecorder {
    pub fn new(dest: &PathBuf) -> BinaryRecorder {
        let mut file = File::create(dest).unwrap();

        // write the header
        let apimsg_type_id = unsafe {
            assert!(mem::size_of::<TypeId>() == mem::size_of::<u64>());
            mem::transmute::<TypeId, u64>(TypeId::of::<ApiMsg>())
        };
        file.write_u64::<LittleEndian>(WEBRENDER_RECORDING_HEADER)
            .ok();
        file.write_u64::<LittleEndian>(apimsg_type_id).ok();

        BinaryRecorder { file }
    }

    fn write_length_and_data(&mut self, data: &[u8]) {
        self.file.write_u32::<LittleEndian>(data.len() as u32).ok();
        self.file.write(data).ok();
    }
}

impl ApiRecordingReceiver for BinaryRecorder {
    fn write_msg(&mut self, _: u32, msg: &ApiMsg) {
        if should_record_msg(msg) {
            let buf = serialize(msg).unwrap();
            self.write_length_and_data(&buf);
        }
    }

    fn write_payload(&mut self, _: u32, data: &[u8]) {
        // signal payload with a 0 length
        self.file.write_u32::<LittleEndian>(0).ok();
        self.write_length_and_data(data);
    }
}

#[derive(Debug)]
pub struct LogRecorder {
    file: File,
}

impl LogRecorder {
    pub fn new(dest: &PathBuf) -> LogRecorder {
        let file = File::create(dest).unwrap();
        LogRecorder { file }
    }
}

impl ApiRecordingReceiver for LogRecorder {
    fn write_msg(&mut self, _: u32, msg: &ApiMsg) {
        let current_time = time::now_utc();
        writeln!(self.file, "{}:{}ms - {:?}", current_time.rfc3339(), current_time.tm_nsec / 1000000, msg).unwrap();
        match *msg {
            ApiMsg::UpdateDocuments(_, ref msgs) => {
                for msg in msgs {
                    writeln!(self.file, "\tTransaction: {:?}", msg).unwrap();
                }
            }
            _ => {},
        }
    }

    fn write_payload(&mut self, _: u32, _data: &[u8]) {
    }
}

fn should_record_transaction_msg(msgs: &TransactionMsg) -> bool {
    if msgs.generate_frame {
        return true;
    }

    for msg in &msgs.scene_ops {
        match *msg {
            SceneMsg::SetDisplayList { .. } |
            SceneMsg::SetRootPipeline { .. } => return true,
            _ => {}
        }
    }

    for msg in &msgs.frame_ops {
        match *msg {
            FrameMsg::GetScrollNodeState(..) |
            FrameMsg::HitTest(..) => {}
            _ => return true,
        }
    }

    false
}

pub fn should_record_msg(msg: &ApiMsg) -> bool {
    match *msg {
        ApiMsg::UpdateResources(..) |
        ApiMsg::AddDocument { .. } |
        ApiMsg::DeleteDocument(..) => true,
        ApiMsg::UpdateDocuments(_, ref msgs) => {
            for msg in msgs {
                if should_record_transaction_msg(msg) {
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}
