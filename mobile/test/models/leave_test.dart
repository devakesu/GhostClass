import 'package:flutter_test/flutter_test.dart';
import 'package:ghostclass/models/leave.dart';

void main() {
  group('Leave Model', () {
    group('fromJson', () {
      test('parses nested entities and applies defaults', () {
        final leave = Leave.fromJson({
          'id': '42',
          'created_at': '2026-05-14T10:00:00Z',
          'leave_reason': 'Medical',
          'attendancetype': {'id': 7, 'name': 'Sick Leave'},
          'event': {'id': 9},
          'usersubgroup': {
            'academic_semester': 'Even',
            'academic_year': '2026',
          },
          'approvers': [
            {
              'id': 1,
              'updated_at': '2026-05-14T12:00:00Z',
              'action_type': 'approved',
              'action_at': '2026-05-14T12:00:00Z',
              'action_by_user': {
                'first_name': 'Prof',
                'last_name': 'Smith',
              },
            },
            {
              'id': '2',
              'updated_at': '2026-05-14T13:00:00Z',
            },
          ],
          'files': [
            {'id': 10, 'file_name': 'doctor-note.pdf', 'size_byte': '512'},
            {'id': 11},
          ],
        });

        expect(leave.id, 42);
        expect(leave.createdAt, '2026-05-14T10:00:00Z');
        expect(leave.leaveReason, 'Medical');
        expect(leave.attendanceType?.id, 7);
        expect(leave.attendanceType?.name, 'Sick Leave');
        expect(leave.event?.id, 9);
        expect(leave.event?.name, 'Event');
        expect(leave.userSubgroup?.academicSemester, 'Even');
        expect(leave.userSubgroup?.academicYear, '2026');
        expect(leave.approvers, hasLength(2));
        expect(leave.approvers.first.actionByUser?.firstName, 'Prof');
        expect(leave.approvers.first.actionByUser?.lastName, 'Smith');
        expect(leave.approvers.last.updatedAt, '2026-05-14T13:00:00Z');
        expect(leave.files, hasLength(2));
        expect(leave.files!.first.fileName, 'doctor-note.pdf');
        expect(leave.files!.first.sizeByte, 512);
        expect(leave.files!.last.fileName, 'file');
        expect(leave.files!.last.sizeByte, 0);
      });

      test('supports minimal payloads and default labels', () {
        final leave = Leave.fromJson({
          'id': 99,
          'created_at': '2026-05-17T00:00:00Z',
          'approvers': [],
        });

        expect(leave.id, 99);
        expect(leave.leaveReason, isNull);
        expect(leave.attendanceType, isNull);
        expect(leave.event, isNull);
        expect(leave.userSubgroup, isNull);
        expect(leave.files, isNull);
        expect(leave.approvers, isEmpty);
      });

      test('handles string id conversion', () {
        final leave = Leave.fromJson({
          'id': '150',
          'created_at': '2026-05-18T00:00:00Z',
          'approvers': [],
        });

        expect(leave.id, 150);
        expect(leave.id is int, true);
      });

      test('handles null attendancetype gracefully', () {
        final leave = Leave.fromJson({
          'id': 160,
          'created_at': '2026-05-19T00:00:00Z',
          'attendancetype': null,
          'approvers': [],
        });

        expect(leave.attendanceType, isNull);
      });

      test('handles null event gracefully', () {
        final leave = Leave.fromJson({
          'id': 170,
          'created_at': '2026-05-20T00:00:00Z',
          'event': null,
          'approvers': [],
        });

        expect(leave.event, isNull);
      });

      test('handles null usersubgroup gracefully', () {
        final leave = Leave.fromJson({
          'id': 180,
          'created_at': '2026-05-21T00:00:00Z',
          'usersubgroup': null,
          'approvers': [],
        });

        expect(leave.userSubgroup, isNull);
      });

      test('handles multiple approvers with mixed data', () {
        final leave = Leave.fromJson({
          'id': 230,
          'created_at': '2026-05-26T00:00:00Z',
          'approvers': [
            {'id': 1, 'updated_at': '2026-05-26T01:00:00Z'},
            {
              'id': 2,
              'updated_at': '2026-05-26T02:00:00Z',
              'action_type': 'rejected',
              'action_by_user': {'first_name': 'Dean', 'last_name': 'Johnson'},
            },
            {'id': 3, 'updated_at': '2026-05-26T03:00:00Z', 'action_type': 'pending'},
          ],
        });

        expect(leave.approvers, hasLength(3));
        expect(leave.approvers[1].actionByUser?.firstName, 'Dean');
        expect(leave.approvers[2].actionType, 'pending');
      });

      test('handles multiple files with valid data', () {
        final leave = Leave.fromJson({
          'id': 240,
          'created_at': '2026-05-27T00:00:00Z',
          'approvers': [],
          'files': [
            {'id': 1, 'file_name': 'file1.pdf', 'size_byte': 1024},
            {'id': 2, 'file_name': 'file2.pdf', 'size_byte': 2048},
            {'id': 3, 'file_name': 'file3.pdf', 'size_byte': 4096},
          ],
        });

        expect(leave.files, hasLength(3));
        expect(leave.files![0].fileName, 'file1.pdf');
        expect(leave.files![1].fileName, 'file2.pdf');
        expect(leave.files![2].fileName, 'file3.pdf');
      });
    });

    group('LeaveFile Model', () {
      test('parses file data correctly', () {
        final file = LeaveFile.fromJson({
          'id': 25,
          'file_name': 'prescription.pdf',
          'size_byte': 2048,
        });

        expect(file.id, 25);
        expect(file.fileName, 'prescription.pdf');
        expect(file.sizeByte, 2048);
      });

      test('defaults missing file_name to "file"', () {
        final file = LeaveFile.fromJson({
          'id': 26,
          'size_byte': 1024,
        });

        expect(file.fileName, 'file');
      });

      test('defaults missing size_byte to 0', () {
        final file = LeaveFile.fromJson({
          'id': 27,
          'file_name': 'doc.txt',
        });

        expect(file.sizeByte, 0);
      });

      test('converts string id and size_byte to int', () {
        final file = LeaveFile.fromJson({
          'id': '28',
          'file_name': 'image.jpg',
          'size_byte': '4096',
        });

        expect(file.id, 28);
        expect(file.sizeByte, 4096);
      });

      test('handles null size_byte', () {
        final file = LeaveFile.fromJson({
          'id': 29,
          'file_name': 'note.txt',
          'size_byte': null,
        });

        expect(file.sizeByte, 0);
      });
    });

    group('AttendanceType Model', () {
      test('parses attendance type data', () {
        final type = AttendanceType.fromJson({
          'id': 100,
          'name': 'Vacation',
        });

        expect(type.id, 100);
        expect(type.name, 'Vacation');
      });

      test('defaults missing name to "Leave"', () {
        final type = AttendanceType.fromJson({'id': 101});

        expect(type.name, 'Leave');
      });

      test('converts string id to int', () {
        final type = AttendanceType.fromJson({
          'id': '102',
          'name': 'Emergency Leave',
        });

        expect(type.id, 102);
      });

      test('handles large id values', () {
        final type = AttendanceType.fromJson({
          'id': 999999,
          'name': 'Special Leave',
        });

        expect(type.id, 999999);
      });
    });

    group('Event Model', () {
      test('parses event data', () {
        final event = Event.fromJson({
          'id': 200,
          'name': 'Wedding',
        });

        expect(event.id, 200);
        expect(event.name, 'Wedding');
      });

      test('defaults missing name to "Event"', () {
        final event = Event.fromJson({'id': 201});

        expect(event.name, 'Event');
      });

      test('converts string id to int', () {
        final event = Event.fromJson({
          'id': '202',
          'name': 'Graduation',
        });

        expect(event.id, 202);
      });

      test('handles large numeric id values', () {
        final event = Event.fromJson({
          'id': 888888,
          'name': 'Conference',
        });

        expect(event.id, 888888);
      });
    });

    group('LeaveSession Model', () {
      test('parses session data with nested objects', () {
        final session = LeaveSession.fromJson({
          'id': 7,
          'date': '2026-05-15',
          'session': {'name': 'Afternoon', 'code': 'PM'},
          'course': {'name': 'Physics', 'code': 'PHY101'},
        });

        expect(session.id, 7);
        expect(session.date, '2026-05-15');
        expect(session.session?.name, 'Afternoon');
        expect(session.course?.name, 'Physics');
      });

      test('tolerates missing optional data', () {
        final session = LeaveSession.fromJson({
          'id': 8,
          'date': '2026-05-16',
        });

        expect(session.id, 8);
        expect(session.date, '2026-05-16');
        expect(session.session, isNull);
        expect(session.course, isNull);
      });

      test('handles null nested objects', () {
        final session = LeaveSession.fromJson({
          'id': 9,
          'date': '2026-05-17',
          'session': null,
          'course': null,
        });

        expect(session.id, 9);
        expect(session.session, isNull);
        expect(session.course, isNull);
      });
    });

    group('LeaveApprover Model', () {
      test('parses approver with action details', () {
        final approver = LeaveApprover.fromJson({
          'id': 50,
          'updated_at': '2026-05-14T12:00:00Z',
          'action_type': 'approved',
          'action_at': '2026-05-14T12:00:00Z',
          'action_by_user': {
            'first_name': 'Prof',
            'last_name': 'Smith',
          },
        });

        expect(approver.id, 50);
        expect(approver.updatedAt, '2026-05-14T12:00:00Z');
        expect(approver.actionType, 'approved');
        expect(approver.actionAt, '2026-05-14T12:00:00Z');
        expect(approver.actionByUser?.firstName, 'Prof');
        expect(approver.actionByUser?.lastName, 'Smith');
      });

      test('handles missing action details gracefully', () {
        final approver = LeaveApprover.fromJson({
          'id': 51,
          'updated_at': '2026-05-15T00:00:00Z',
        });

        expect(approver.id, 51);
        expect(approver.updatedAt, '2026-05-15T00:00:00Z');
        expect(approver.actionType, isNull);
        expect(approver.actionAt, isNull);
        expect(approver.actionByUser, isNull);
      });

      test('converts string id to int', () {
        final approver = LeaveApprover.fromJson({
          'id': '52',
          'updated_at': '2026-05-16T00:00:00Z',
        });

        expect(approver.id, 52);
      });
    });

    group('roundtrip', () {
      test('Leave with full nested data parses consistently', () {
        final data = {
          'id': '300',
          'created_at': '2026-05-30T00:00:00Z',
          'leave_reason': 'Personal',
          'attendancetype': {'id': 1, 'name': 'Leave'},
          'event': {'id': 1, 'name': 'Family Event'},
          'approvers': [
            {'id': 1, 'updated_at': '2026-05-30T12:00:00Z', 'action_type': 'approved'}
          ],
          'files': [],
        };

        final leave = Leave.fromJson(data);

        expect(leave.id, 300);
        expect(leave.leaveReason, 'Personal');
        expect(leave.approvers.length, 1);
        expect(leave.files, isEmpty);
      });

      test('minimal Leave data parses without errors', () {
        final data = {
          'id': 301,
          'created_at': '2026-05-31T00:00:00Z',
          'approvers': [],
        };

        final leave = Leave.fromJson(data);

        expect(leave.id, 301);
        expect(leave.leaveReason, isNull);
        expect(leave.attendanceType, isNull);
      });
    });
  });
}